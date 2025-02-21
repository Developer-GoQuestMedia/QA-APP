import { Redis as UpstashRedis } from '@upstash/redis';
import IORedis from 'ioredis';

let redisClient: UpstashRedis | IORedis | null = null;

export function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  // Check for Upstash Redis configuration
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    // Use Upstash Redis REST client
    try {
      redisClient = new UpstashRedis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });

      console.log('Initialized Upstash Redis client');
    } catch (error) {
      console.error('Failed to initialize Upstash Redis client:', error);
      redisClient = null;
    }
  } else if (process.env.NODE_ENV !== 'production') {
    // Development: Use local Redis
    try {
      redisClient = new IORedis({
        host: '127.0.0.1',
        port: 6379,
        maxRetriesPerRequest: null,
        retryStrategy: (times: number) => {
          if (times > 3) {
            console.error('Redis connection failed after 3 retries');
            return null;
          }
          const delay = Math.min(times * 200, 1000);
          return delay;
        },
        commandTimeout: 5000,
        maxLoadingRetryTime: 3000,
        enableOfflineQueue: true,
        connectTimeout: 10000,
        lazyConnect: true
      });

      // For local Redis only, try to set eviction policy
      if (redisClient instanceof IORedis) {
        redisClient.config('SET', 'maxmemory', '2gb').catch(() => {
          console.warn('Failed to set Redis maxmemory configuration');
        });
        
        redisClient.config('SET', 'maxmemory-policy', 'noeviction').catch(() => {
          console.warn('Failed to set Redis eviction policy');
        });
      }

      console.log('Initialized local Redis client for development');
    } catch (error) {
      console.error('Failed to initialize local Redis client:', error);
      redisClient = null;
    }
  } else {
    console.warn('Redis configuration missing. Some features may be unavailable.');
    redisClient = null;
  }

  return redisClient;
}

// Helper function to check if Redis is connected
export async function isRedisConnected(): Promise<boolean> {
  try {
    const client = getRedisClient();
    if (!client) {
      return false;
    }

    if (client instanceof IORedis) {
      return client.status === 'ready';
    } else {
      // For Upstash Redis, try a simple operation
      await client.ping();
      return true;
    }
  } catch (error) {
    console.error('Redis connection check failed:', error);
    return false;
  }
}

// Helper function to safely execute Redis operations
export async function executeRedisOperation<T>(
  operation: () => Promise<T>,
  fallbackValue: T
): Promise<T> {
  try {
    const client = getRedisClient();
    if (!client) {
      console.warn('Redis client not available, using fallback value');
      return fallbackValue;
    }
    return await operation();
  } catch (error) {
    console.error('Redis operation failed:', error);
    return fallbackValue;
  }
} 