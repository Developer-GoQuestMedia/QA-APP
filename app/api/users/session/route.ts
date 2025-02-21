import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const headersList = headers()
  const host = headersList.get('host')
  const origin = headersList.get('origin')
  
  try {
    const session = await getServerSession(authOptions)
    
    console.log('Session check details:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      nextAuthUrl: process.env.NEXTAUTH_URL,
      vercelUrl: process.env.VERCEL_URL,
      headers: {
        host,
        origin,
        referer: headersList.get('referer'),
        cookie: headersList.get('cookie')?.substring(0, 100) + '...' // Log partial cookie for debugging
      }
    })
    
    if (!session) {
      return NextResponse.json({ 
        error: 'No session found',
        debug: {
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV,
          nextAuthUrl: process.env.NEXTAUTH_URL,
          vercelUrl: process.env.VERCEL_URL,
          host,
          origin
        }
      }, { 
        status: 401,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    }

    if (!session.user) {
      return NextResponse.json({ 
        error: 'No user in session',
        debug: {
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV,
          nextAuthUrl: process.env.NEXTAUTH_URL,
          vercelUrl: process.env.VERCEL_URL,
          host,
          origin
        }
      }, { 
        status: 401,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    }

    return NextResponse.json({
      ...session.user,
      debug: {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        nextAuthUrl: process.env.NEXTAUTH_URL,
        vercelUrl: process.env.VERCEL_URL,
        host,
        origin
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error) {
    console.error('Error in /api/users/session:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : typeof error,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      nextAuthUrl: process.env.NEXTAUTH_URL,
      vercelUrl: process.env.VERCEL_URL,
      host,
      origin
    })
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch user data',
        debug: {
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV,
          nextAuthUrl: process.env.NEXTAUTH_URL,
          vercelUrl: process.env.VERCEL_URL,
          host,
          origin
        }
      },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )
  }
} 