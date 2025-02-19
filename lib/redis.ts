import { Redis as UpstashRedis } from '@upstash/redis';
import IORedis from 'ioredis';

let redisClient: UpstashRedis | IORedis | null = null;

export function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  if (process.env.NODE_ENV === 'production') {
    // Production: Use Upstash Redis
    redisClient = new UpstashRedis({
      url: process.env.REDIS_URL || '',
      token: process.env.REDIS_TOKEN || '',
    });

    console.log('Initialized Upstash Redis client for production');
  } else {
    // Development: Use local Redis
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
      }
    });

    console.log('Initialized local Redis client for development');
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
    return await operation();
  } catch (error) {
    console.error('Redis operation failed:', error);
    return fallbackValue;
  }
} 