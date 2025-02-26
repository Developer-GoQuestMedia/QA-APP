// lib/queue.ts
import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import type { Redis } from 'ioredis';
import logger from './logger';

/**
 * Redis connection configuration
 */
function getRedisConfig() {
  // Check for Upstash Redis configuration
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
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
    } catch (error) {
      console.error('Failed to parse Redis URL:', error);
      return null;
    }
  } else if (process.env.NODE_ENV !== 'production') {
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
  } else {
    console.warn('Redis configuration missing. Queue functionality will be unavailable.');
    return null;
  }
}

let connection: IORedis | null = null;

/**
 * Get or create Redis connection
 */
export const getRedisConnection = () => {
  if (!connection) {
    try {
      const config = getRedisConfig();
      if (!config) {
        logger.warn('Redis configuration not available');
        return null;
      }

      connection = new IORedis(config);

      // Only set up event listeners if we don't have a connection
      connection.on('error', (error: Error) => {
        logger.error('Redis connection error:', { error });
        // Reset connection on error so we can retry
        connection = null;
      });

      connection.on('connect', () => {
        logger.info('Redis connected successfully');
      });

      connection.on('ready', () => {
        logger.info('Redis client ready');
        // For local Redis only, try to set eviction policy
        if (process.env.NODE_ENV !== 'production' && connection) {
          connection.config('SET', 'maxmemory', '2gb').catch(() => {
            logger.warn('Failed to set Redis maxmemory configuration');
          });
          
          connection.config('SET', 'maxmemory-policy', 'noeviction').catch(() => {
            logger.warn('Failed to set Redis eviction policy');
          });
        }
      });

      // Test the connection only once
      connection.ping().then(() => {
        logger.info('Redis connection test successful');
      }).catch((error) => {
        logger.error('Redis connection test failed:', { error });
        connection = null;
      });
    } catch (error) {
      logger.error('Failed to create Redis connection:', { error });
      connection = null;
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
    if (!queueConnection) {
      console.warn('Redis connection not available. Queue functionality will be limited.');
      return null;
    }

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
    return null;
  }
};

// Export the queue instance
export const audioCleanerQueue = createAudioCleanerQueue();
