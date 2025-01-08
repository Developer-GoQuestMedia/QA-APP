import { getToken } from 'next-auth/jwt'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { UserRole } from '@/types/user'

// Define role-based route mappings with proper typing
const ROLE_ROUTES: Record<UserRole, string[]> = {
  admin: ['/allDashboards/admin', '/api/admin'],
  director: ['/allDashboards/director'],
  voiceOver: ['/allDashboards/voice-over'],
  transcriber: ['/allDashboards/transcriber'],
  translator: ['/allDashboards/translator']
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
  const startTime: number = Date.now()
  
  // Add protection against infinite redirects
  const redirectCount = parseInt(request.headers.get('x-redirect-count') || '0')
  if (redirectCount > 10) {
    console.error('Infinite redirect detected:', {
      pathname: request.nextUrl.pathname,
      redirectCount,
      timestamp: new Date().toISOString()
    })
    return new NextResponse('Too many redirects', { status: 508 })
  }

  console.log('Middleware processing started:', {
    pathname: request.nextUrl.pathname,
    method: request.method,
    timestamp: new Date().toISOString(),
    headers: {
      userAgent: request.headers.get('user-agent'),
      referer: request.headers.get('referer'),
      redirectCount
    }
  })

  const token = await getToken({ req: request })
  console.log('Token validation:', {
    hasToken: !!token,
    role: token?.role,
    username: token?.username,
    timestamp: new Date().toISOString(),
    tokenExpiry: token?.exp ? new Date(Number(token.exp) * 1000).toISOString() : null
  })

  const { pathname } = request.nextUrl

  // Public paths that don't require authentication
  if (pathname === '/login') {
    if (token) {
      // Redirect to role-specific dashboard if already authenticated
      const userRole = token.role as UserRole
      const roleRoute = ROLE_ROUTES[userRole]?.[0]
      if (!roleRoute) {
        console.error('Invalid role mapping:', {
          userRole,
          availableRoles: Object.keys(ROLE_ROUTES),
          timestamp: new Date().toISOString()
        })
        return new NextResponse('Invalid role configuration', { status: 500 })
      }
      
      console.log('Authenticated user accessing login page:', {
        userRole,
        roleRoute,
        timestamp: new Date().toISOString(),
        action: 'redirecting_to_dashboard'
      })
      
      const response = NextResponse.redirect(new URL(roleRoute, request.url))
      response.headers.set('x-redirect-count', (redirectCount + 1).toString())
      return response
    }
    console.log('Unauthenticated user accessing login page:', {
      timestamp: new Date().toISOString(),
      action: 'allowing_access'
    })
    return NextResponse.next()
  }

  // Protected routes
  if (!token) {
    console.log('Unauthorized access attempt:', {
      pathname,
      timestamp: new Date().toISOString(),
      action: 'redirecting_to_login'
    })
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.headers.set('x-redirect-count', (redirectCount + 1).toString())
    return response
  }

  // Handle root dashboard route
  if (pathname === '/allDashboards') {
    const userRole = token.role as UserRole
    const roleRoute = ROLE_ROUTES[userRole]?.[0]
    if (!roleRoute) {
      console.error('Invalid role mapping for dashboard:', {
        userRole,
        availableRoles: Object.keys(ROLE_ROUTES),
        timestamp: new Date().toISOString()
      })
      return new NextResponse('Invalid role configuration', { status: 500 })
    }

    console.log('Dashboard route resolution:', {
      userRole,
      roleRoute,
      timestamp: new Date().toISOString(),
      action: 'redirecting_to_role_dashboard'
    })
    
    const response = NextResponse.redirect(new URL(roleRoute, request.url))
    response.headers.set('x-redirect-count', (redirectCount + 1).toString())
    return response
  }

  // Role-based access control for both dashboard and project detail pages
  const userRole = token.role as UserRole
  if (!ROLE_ROUTES[userRole]) {
    console.error('Unknown user role:', {
      userRole,
      availableRoles: Object.keys(ROLE_ROUTES),
      timestamp: new Date().toISOString()
    })
    return new NextResponse('Invalid role configuration', { status: 500 })
  }

  console.log('Role-based access check:', {
    userRole,
    pathname,
    availableRoutes: ROLE_ROUTES[userRole],
    timestamp: new Date().toISOString()
  })

  for (const [role, paths] of Object.entries(ROLE_ROUTES)) {
    const isRoleRoute = paths.some(path => {
      // Check both the dashboard route and any project detail pages under it
      const matches = pathname.startsWith(path) || pathname.match(new RegExp(`${path}/[^/]+`))
      console.log('Route permission check:', {
        role,
        path,
        pathname,
        matches,
        timestamp: new Date().toISOString()
      })
      return matches
    })

    if (isRoleRoute && role !== userRole) {
      // Redirect to user's dashboard if trying to access unauthorized role-based route
      const correctPath = ROLE_ROUTES[userRole]?.[0]
      if (!correctPath) {
        console.error('Invalid role mapping for redirect:', {
          userRole,
          availableRoles: Object.keys(ROLE_ROUTES),
          timestamp: new Date().toISOString()
        })
        return new NextResponse('Invalid role configuration', { status: 500 })
      }

      console.log('Unauthorized role access attempt:', {
        attemptedRole: role,
        userRole,
        correctPath,
        timestamp: new Date().toISOString(),
        action: 'redirecting_to_authorized_route'
      })
      
      const response = NextResponse.redirect(new URL(correctPath, request.url))
      response.headers.set('x-redirect-count', (redirectCount + 1).toString())
      return response
    }
  }

  const processingTime = Date.now() - startTime
  console.log('Middleware processing completed:', {
    userRole,
    pathname,
    processingTimeMs: processingTime,
    timestamp: new Date().toISOString(),
    action: 'access_granted'
  })
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/allDashboards/:path*',
    '/api/admin/:path*',
    '/api/projects/:path*',
    '/api/dialogues/:path*',
    '/login'
  ]
} 