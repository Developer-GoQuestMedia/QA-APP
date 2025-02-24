import { getToken } from 'next-auth/jwt'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { UserRole } from '@/types/user'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import logger from './lib/logger'
import { 
  handleApiError, 
  RateLimitError, 
  AuthenticationError, 
  ForbiddenError 
} from './lib/errors'

// Initialize Redis for rate limiting
const redis = new Redis({
  url: process.env.REDIS_URL || '',
  token: process.env.REDIS_TOKEN || '',
})

// Create rate limiter
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '10 s'), // 10 requests per 10 seconds
})

// CORS configuration
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL || '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-request-id',
  'Access-Control-Max-Age': '86400',
}

// Security headers
const securityHeaders = {
  'X-DNS-Prefetch-Control': 'on',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-XSS-Protection': '1; mode=block',
  'Content-Security-Policy': `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline';
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data:;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    block-all-mixed-content;
    upgrade-insecure-requests;
  `.replace(/\s+/g, ' ').trim(),
}

// Protected routes that require authentication
const protectedRoutes = [
  '/api/projects',
  '/api/episodes',
  '/api/dialogues',
  '/api/voice-models',
  '/api/admin',
]

// Admin routes that require admin role
const adminRoutes = [
  '/api/admin',
]

// Define role-based route mappings with proper typing
const ROLE_ROUTES: Record<UserRole, string[]> = {
  admin: ['/allDashboards/admin', '/api/admin'],
  transcriber: ['/allDashboards/transcriber'],
  translator: ['/allDashboards/translator'],
  voiceOver: ['/allDashboards/voice-over']
}

// Helper function to convert role to URL path
const roleToUrlPath = (role: UserRole): string => {
  console.log('Converting role to URL path:', { 
    role,
    timestamp: new Date().toISOString()
  })
  switch (role) {
    case 'voiceOver':
      return 'voice-over'
    default:
      return role
  }
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const { pathname } = request.nextUrl
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID()

  try {
    // Log request
    logger.info('Processing request', {
      requestId,
      method: request.method,
      pathname,
      ip: request.ip,
      userAgent: request.headers.get('user-agent'),
    })

    // 1. Add security headers
    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value)
    })

    // 2. Handle CORS
    if (request.method === 'OPTIONS') {
      const response = new NextResponse(null, { status: 204 })
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value)
      })
      return response
    }

    // 3. Rate limiting for API routes
    if (pathname.startsWith('/api')) {
      const ip = request.ip ?? '127.0.0.1'
      const { success, limit, reset, remaining } = await ratelimit.limit(ip)

      response.headers.set('X-RateLimit-Limit', limit.toString())
      response.headers.set('X-RateLimit-Remaining', remaining.toString())
      response.headers.set('X-RateLimit-Reset', reset.toString())

      if (!success) {
        throw new RateLimitError('Too many requests', {
          ip,
          limit,
          reset,
          remaining,
        }, requestId)
      }
    }

    // 4. Authentication check for protected routes
    if (protectedRoutes.some(route => pathname.startsWith(route))) {
      const token = await getToken({ req: request })

      if (!token) {
        throw new AuthenticationError('Please login to access this resource', {
          pathname,
        }, requestId)
      }

      // 5. Role-based access control for admin routes
      if (adminRoutes.some(route => pathname.startsWith(route))) {
        if (token.role !== 'admin') {
          throw new ForbiddenError('Admin access required', {
            pathname,
            user: token.email,
            role: token.role,
          }, requestId)
        }
      }
    }

    // 6. Add CORS headers to all responses
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value)
    })

    // Add request ID to response headers
    response.headers.set('x-request-id', requestId)

    // Log successful response
    logger.info('Request processed successfully', {
      requestId,
      pathname,
      method: request.method,
    })

    return response
  } catch (error) {
    return handleApiError(error, request)
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ]
} 