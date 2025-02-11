// lib/queue.ts
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { Redis } from 'ioredis';

/**
 * Redis connection configuration
 */
const redisConfig = {
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,    // Recommended for better performance
  retryStrategy: (times: number) => {
    if (times > 3) {
      console.error('Redis connection failed after 3 retries');
      return null;
    }
    const delay = Math.min(times * 200, 1000);
    return delay;
  }
};

let connection: Redis | null = null;

/**
 * Get or create Redis connection
 */
export const getRedisConnection = () => {
  if (!connection) {
    try {
      // Try to use REDIS_URL from environment if available
      const redisUrl = process.env.REDIS_URL;
      connection = redisUrl ? new IORedis(redisUrl, { maxRetriesPerRequest: null }) : new IORedis(redisConfig);
      
      connection.on('error', (error: Error) => {
        console.error('Redis connection error:', error);
      });

      connection.on('connect', () => {
        console.log('Redis connected successfully');
      });

      connection.on('ready', () => {
        console.log('Redis client ready');
      });

      // Test the connection
      connection.ping().then(() => {
        console.log('Redis connection test successful');
      }).catch((error) => {
        console.error('Redis connection test failed:', error);
      });
    } catch (error) {
      console.error('Failed to create Redis connection:', error);
      throw error;
    }
  }
  return connection;
};

/**
 * Create audio cleaner queue with error handling
 */
export const createAudioCleanerQueue = () => {
  try {
    const queueConnection = getRedisConnection();
    return new Queue('audio-cleaner-queue', { 
      connection: queueConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        },
        removeOnComplete: true,
        removeOnFail: false
      }
    });
  } catch (error) {
    console.error('Failed to create audio cleaner queue:', error);
    throw error;
  }
};

// Export the queue instance
export const audioCleanerQueue = createAudioCleanerQueue();
