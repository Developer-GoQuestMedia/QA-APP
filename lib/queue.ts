// lib/queue.ts
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { Redis } from 'ioredis';

/**
 * Redis connection configuration
 */
function getRedisConfig() {
  if (process.env.NODE_ENV === 'production') {
    // Production configuration (Upstash)
    return {
      url: process.env.REDIS_URL,
      token: process.env.REDIS_TOKEN,
      tls: {
        url: process.env.REDIS_TLS_URL,
        rejectUnauthorized: false
      },
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        if (times > 3) {
          console.error('Redis connection failed after 3 retries');
          return null;
        }
        const delay = Math.min(times * 200, 1000);
        return delay;
      }
    };
  } else {
    // Local development configuration
    return {
      host: '127.0.0.1',
      port: 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        if (times > 3) {
          console.error('Redis connection failed after 3 retries');
          return null;
        }
        const delay = Math.min(times * 200, 1000);
        return delay;
      }
    };
  }
}

let connection: Redis | null = null;

/**
 * Get or create Redis connection
 */
export const getRedisConnection = () => {
  if (!connection) {
    try {
      const config = getRedisConfig();
      
      if (process.env.NODE_ENV === 'production') {
        // For Upstash in production
        connection = new IORedis(config.url!, {
          tls: config.tls,
          maxRetriesPerRequest: null,
          retryStrategy: config.retryStrategy
        });
      } else {
        // For local development
        connection = new IORedis(config);
      }

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
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 100 // Keep last 100 completed jobs
        },
        removeOnFail: {
          age: 7 * 24 * 3600 // Keep failed jobs for 7 days
        }
      }
    });
  } catch (error) {
    console.error('Failed to create audio cleaner queue:', error);
    throw error;
  }
};

// Export the queue instance
export const audioCleanerQueue = createAudioCleanerQueue();
