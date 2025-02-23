import { NextApiRequest } from 'next';
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

interface RateLimitResult {
  success: boolean;
  remaining?: number;
  resetTime?: number;
}

export async function rateLimit(
  req: NextApiRequest,
  options = { limit: 10, window: 60 }
): Promise<RateLimitResult> {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const key = `rate-limit:${ip}:${req.url}`;

  try {
    const [current] = await redis
      .multi()
      .incr(key)
      .expire(key, options.window)
      .exec();

    const count = current?.[1] as number;
    const remaining = Math.max(0, options.limit - count);
    
    if (count > options.limit) {
      return {
        success: false,
        remaining: 0,
        resetTime: Date.now() + (options.window * 1000)
      };
    }

    return {
      success: true,
      remaining,
      resetTime: Date.now() + (options.window * 1000)
    };
  } catch (error) {
    console.error('Rate limiting error:', error);
    // Fail open in case of Redis error
    return { success: true };
  }
} 