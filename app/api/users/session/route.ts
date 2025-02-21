import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET() {
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
        host: headers().get('host'),
        origin: headers().get('origin'),
        referer: headers().get('referer')
      }
    })
    
    if (!session) {
      return NextResponse.json({ 
        error: 'No session found',
        debug: {
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV,
          nextAuthUrl: process.env.NEXTAUTH_URL,
          vercelUrl: process.env.VERCEL_URL
        }
      }, { 
        status: 401,
        headers: {
          'Cache-Control': 'no-store, max-age=0'
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
          vercelUrl: process.env.VERCEL_URL
        }
      }, { 
        status: 401,
        headers: {
          'Cache-Control': 'no-store, max-age=0'
        }
      })
    }

    return NextResponse.json({
      ...session.user,
      debug: {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        nextAuthUrl: process.env.NEXTAUTH_URL,
        vercelUrl: process.env.VERCEL_URL
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    })
  } catch (error) {
    console.error('Error in /api/users/session:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : typeof error,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      nextAuthUrl: process.env.NEXTAUTH_URL,
      vercelUrl: process.env.VERCEL_URL
    })
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch user data',
        debug: {
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV,
          nextAuthUrl: process.env.NEXTAUTH_URL,
          vercelUrl: process.env.VERCEL_URL
        }
      },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0'
        }
      }
    )
  }
} 