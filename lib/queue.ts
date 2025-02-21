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
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('Missing required Redis configuration for production');
    }
    
    const redisUrl = `redis://default:${process.env.UPSTASH_REDIS_REST_TOKEN}@${new URL(process.env.UPSTASH_REDIS_REST_URL).host}:6379`;
    const url = new URL(redisUrl);
    
    return {
      host: url.hostname,
      port: parseInt(url.port),
      username: url.username,
      password: url.password,
      tls: { rejectUnauthorized: false },
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      commandTimeout: 5000,
      maxLoadingRetryTime: 3000,
      enableOfflineQueue: true,
      connectTimeout: 10000,
      lazyConnect: true,
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
      commandTimeout: 5000,
      maxLoadingRetryTime: 3000,
      enableOfflineQueue: true,
      connectTimeout: 10000,
      lazyConnect: true,
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
      connection = new IORedis(config);

      // Only set up event listeners if we don't have a connection
      connection.on('error', (error: Error) => {
        console.error('Redis connection error:', error);
        // Reset connection on error so we can retry
        connection = null;
      });

      connection.on('connect', () => {
        console.log('Redis connected successfully');
      });

      connection.on('ready', () => {
        console.log('Redis client ready');
        // For local Redis only, try to set eviction policy
        if (process.env.NODE_ENV !== 'production' && connection) {
          connection.config('SET', 'maxmemory', '2gb').catch(() => {
            console.warn('Failed to set Redis maxmemory configuration');
          });
          
          connection.config('SET', 'maxmemory-policy', 'noeviction').catch(() => {
            console.warn('Failed to set Redis eviction policy');
          });
        }
      });

      // Test the connection only once
      connection.ping().then(() => {
        console.log('Redis connection test successful');
      }).catch((error) => {
        console.error('Redis connection test failed:', error);
        connection = null;
      });
    } catch (error) {
      console.error('Failed to create Redis connection:', error);
      connection = null;
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
