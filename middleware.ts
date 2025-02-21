import { getToken } from 'next-auth/jwt'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { UserRole } from '@/types/user'

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
  const pathname = request.nextUrl.pathname
  
  // Log request details
  console.log('Middleware processing started:', {
    pathname,
    method: request.method,
    timestamp: new Date().toISOString(),
    headers: {
      userAgent: request.headers.get('user-agent'),
      referer: request.headers.get('referer'),
      redirectCount: request.headers.get('x-redirect-count')
    }
  })

  // Skip auth check for public paths
  if (
    pathname.startsWith('/_next') || // Next.js static files
    pathname.startsWith('/api/auth') || // Auth API routes
    pathname === '/login' || // Login page
    pathname === '/unauthorized' || // Unauthorized page
    pathname === '/favicon.ico' // Favicon
  ) {
    if (pathname === '/login') {
      console.log('Unauthenticated user accessing login page:', {
        timestamp: new Date().toISOString(),
        action: 'allowing_access'
      })
    }
    return NextResponse.next()
  }

  try {
    // Validate token
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET
    })

    console.log('Token validation:', {
      hasToken: !!token,
      role: token?.role,
      username: token?.username,
      timestamp: new Date().toISOString(),
      tokenExpiry: token?.exp ? new Date(Number(token.exp) * 1000).toISOString() : null
    })

    // No token, redirect to login
    if (!token) {
      console.log('No token found, redirecting to login:', {
        pathname,
        timestamp: new Date().toISOString()
      })
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Token exists but expired
    if (token.exp && Date.now() >= Number(token.exp) * 1000) {
      console.log('Token expired, redirecting to login:', {
        pathname,
        expiry: new Date(Number(token.exp) * 1000).toISOString(),
        timestamp: new Date().toISOString()
      })
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Check role-based access
    const role = token.role as UserRole
    if (pathname.startsWith('/allDashboards/')) {
      const dashboardRole = pathname.split('/')[2]
      // Convert dashboard path to role format
      const normalizedDashboardRole = dashboardRole === 'voice-over' ? 'voiceOver' : dashboardRole
      
      // Check if user has access to this dashboard
      const hasAccess = role === 'admin' || role === normalizedDashboardRole
      
      if (!hasAccess) {
        console.log('Unauthorized dashboard access attempt:', {
          pathname,
          userRole: role,
          requiredRole: normalizedDashboardRole,
          timestamp: new Date().toISOString()
        })
        // Redirect to their appropriate dashboard instead of unauthorized
        const userDashboard = `/allDashboards/${roleToUrlPath(role)}`
        return NextResponse.redirect(new URL(userDashboard, request.url))
      }
    }

    return NextResponse.next()
  } catch (error) {
    console.error('Middleware error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : typeof error,
      pathname,
      timestamp: new Date().toISOString()
    })
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * 1. /_next (Next.js internals)
     * 2. /api/auth (NextAuth.js API routes)
     * 3. /static (public files)
     * 4. /*.{png,jpg,gif,ico} (static images)
     * 5. /manifest.json (PWA manifest)
     */
    '/((?!_next|api/auth|static|.*\\.(?:png|jpg|gif|ico)|manifest.json).*)'
  ]
} 