import { Redis } from 'ioredis';
import { getRedisConnection } from './queue';

interface RateLimiter {
  isRateLimited: () => Promise<boolean>;
}

const RATE_LIMIT_DURATION = 60; // 1 minute
const MAX_REQUESTS = 100; // Maximum requests per minute

export async function rateLimit(): Promise<RateLimiter> {
  const redis: Redis = getRedisConnection();
  const ip = 'API_RATE_LIMIT'; // Using a constant key for API rate limiting

  return {
    isRateLimited: async () => {
      try {
        const currentRequests = await redis.incr(ip);
        
        if (currentRequests === 1) {
          await redis.expire(ip, RATE_LIMIT_DURATION);
        }

        return currentRequests > MAX_REQUESTS;
      } catch (error) {
        console.error('Rate limit check failed:', error);
        return false; // Fail open if Redis is unavailable
      }
    }
  };
} 