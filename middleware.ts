import { getToken } from 'next-auth/jwt'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { UserRole } from '@/types/project'

// Define role-based route mappings with proper typing
const ROLE_ROUTES: Record<UserRole, string[]> = {
  admin: ['/allDashboards/admin', '/api/admin'],
  director: ['/allDashboards/director'],
  voiceOver: ['/allDashboards/voice-over'],  // URL still uses kebab-case
  transcriber: ['/allDashboards/transcriber'],
  translator: ['/allDashboards/translator']
}

// Helper function to convert role to URL format
const roleToUrlPath = (role: UserRole): string => {
  return role === 'voiceOver' ? 'voice-over' : role
}

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request })
  const { pathname } = request.nextUrl

  // Public paths that don't require authentication
  if (pathname === '/login') {
    if (token) {
      // Redirect to role-specific dashboard if already authenticated
      const userRole = token.role as UserRole
      const roleRoute = ROLE_ROUTES[userRole]?.[0] || '/allDashboards'
      return NextResponse.redirect(new URL(roleRoute, request.url))
    }
    return NextResponse.next()
  }

  // Protected routes
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Handle root dashboard route
  if (pathname === '/allDashboards') {
    const userRole = token.role as UserRole
    const roleRoute = ROLE_ROUTES[userRole]?.[0] || '/allDashboards'
    return NextResponse.redirect(new URL(roleRoute, request.url))
  }

  // Role-based access control for both dashboard and project detail pages
  const userRole = token.role as UserRole
  for (const [role, paths] of Object.entries(ROLE_ROUTES)) {
    const isRoleRoute = paths.some(path => {
      // Check both the dashboard route and any project detail pages under it
      return pathname.startsWith(path) || pathname.match(new RegExp(`${path}/[^/]+`))
    })
    if (isRoleRoute && role !== userRole) {
      // Redirect to user's dashboard if trying to access unauthorized role-based route
      const correctPath = ROLE_ROUTES[userRole]?.[0] || '/allDashboards'
      return NextResponse.redirect(new URL(correctPath, request.url))
    }
  }

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