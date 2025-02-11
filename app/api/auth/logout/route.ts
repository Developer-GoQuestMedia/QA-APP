import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'
import type { Document } from 'mongodb'

interface SessionLog {
  logoutTime: Date;
  userAgent: string;
}

interface UserDocument {
  username: string;
  sessionsLog: SessionLog[];
  lastLogout: Date;
  isActive: boolean;
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (session?.user) {
      const { db } = await connectToDatabase()
      
      await db.collection('users').updateOne(
        { username: session.user.username },
        {
          $set: { 
            lastLogout: new Date(),
            isActive: false
          },
          $push: {
            'sessionsLog': {
              logoutTime: new Date(),
              userAgent: process.env.NODE_ENV === 'development' ? 'development' : 'production'
            } as any
          }
        }
      )
    }

    // Clear all cookies
    const response = NextResponse.json(
      { success: true, message: 'Logged out successfully' },
      { status: 200 }
    )

    response.cookies.delete('next-auth.session-token')
    response.cookies.delete('next-auth.csrf-token')
    response.cookies.delete('next-auth.callback-url')
    response.cookies.delete('__Secure-next-auth.session-token')
    response.cookies.delete('__Secure-next-auth.csrf-token')
    response.cookies.delete('__Secure-next-auth.callback-url')
    response.cookies.delete('__Host-next-auth.csrf-token')

    return response
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    )
  }
} 