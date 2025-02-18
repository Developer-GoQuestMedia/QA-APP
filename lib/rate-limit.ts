import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Initialize Redis client
const redis = new Redis({
  url: process.env.REDIS_URL || '',
  token: process.env.REDIS_TOKEN || '',
})

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
  backoffMs?: number // Optional backoff time for repeat offenders
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
  backoffMs: 5 * 60 * 1000 // 5 minutes
}

interface RateLimitInfo {
  currentRequests: number
  backoffUntil?: number
}

// Cleanup expired rate limit keys
async function cleanupExpiredKeys() {
  try {
    const keys = await redis.keys('rate-limit:*')
    const now = Date.now()
    
    for (const key of keys) {
      const info = await redis.get<RateLimitInfo>(key)
      if (info && info.backoffUntil && info.backoffUntil < now) {
        await redis.del(key)
      }
    }
  } catch (error) {
    console.error('Failed to cleanup rate limit keys:', error)
  }
}

// Periodically cleanup (1% chance per request)
async function maybeCleanup() {
  if (Math.random() < 0.01) {
    await cleanupExpiredKeys()
  }
}

export async function rateLimit(
  request: NextRequest,
  config: RateLimitConfig = DEFAULT_CONFIG
) {
  const ip = request.ip || 'anonymous'
  const key = `rate-limit:${ip}`

  try {
    await maybeCleanup()

    // Get current rate limit info
    const info = await redis.get<RateLimitInfo>(key) || { currentRequests: 0 }

    // Check if in backoff period
    if (info.backoffUntil && info.backoffUntil > Date.now()) {
      const remainingBackoff = Math.ceil((info.backoffUntil - Date.now()) / 1000)
      return new NextResponse(
        JSON.stringify({
          error: 'Too many requests',
          message: `Please try again in ${remainingBackoff} seconds`
        }),
        {
          status: 429,
          headers: {
            'Retry-After': remainingBackoff.toString(),
            'X-RateLimit-Reset': info.backoffUntil.toString()
          }
        }
      )
    }

    // Increment request count
    info.currentRequests++

    // Set expiry and update info
    const windowSeconds = Math.ceil(config.windowMs / 1000)
    await redis.set(key, info, { ex: windowSeconds })

    const remainingRequests = config.maxRequests - info.currentRequests

    // Set rate limit headers
    const headers = new Headers()
    headers.set('X-RateLimit-Limit', config.maxRequests.toString())
    headers.set('X-RateLimit-Remaining', Math.max(0, remainingRequests).toString())
    headers.set('X-RateLimit-Reset', (Date.now() + config.windowMs).toString())

    if (info.currentRequests > config.maxRequests) {
      // Set backoff period for repeat offenders
      if (config.backoffMs) {
        info.backoffUntil = Date.now() + config.backoffMs
        await redis.set(key, info, { ex: Math.ceil(config.backoffMs / 1000) })
      }

      return new NextResponse(
        JSON.stringify({
          error: 'Too many requests',
          message: 'Please try again later'
        }),
        {
          status: 429,
          headers
        }
      )
    }

    return null
  } catch (error) {
    console.error('Rate limiting error:', error)
    // Log the error but allow the request to proceed
    return null
  }
} 