import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    console.log('Session check details:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      nextAuthUrl: process.env.NEXTAUTH_URL
    })
    
    if (!session) {
      return NextResponse.json({ 
        error: 'No session found',
        debug: {
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV
        }
      }, { status: 401 })
    }

    if (!session.user) {
      return NextResponse.json({ 
        error: 'No user in session',
        debug: {
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV
        }
      }, { status: 401 })
    }

    return NextResponse.json({
      ...session.user,
      debug: {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
      }
    })
  } catch (error) {
    console.error('Error in /api/users/session:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : typeof error,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    })
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch user data',
        debug: {
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV
        }
      },
      { status: 500 }
    )
  }
} 