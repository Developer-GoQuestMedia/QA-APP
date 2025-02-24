import CredentialsProvider from 'next-auth/providers/credentials'
import { connectToDatabase } from '@/lib/mongodb'
import bcrypt from 'bcryptjs'
import type { NextAuthOptions } from 'next-auth'
import crypto from 'crypto'
import { MongoClient, Db, ObjectId } from 'mongodb'
import { z } from 'zod'

// Password validation schema
const passwordSchema = z.string().min(8).regex(
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
  'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
)

// User type definition
interface User {
  _id: ObjectId
  email: string
  password: string
  role: string
  username: string
  lastLogin?: Date
  sessionsLog?: SessionLog[]
}

interface SessionLog {
  loginTime: Date
  userAgent: string
  ip: string
  sessionId: string
}

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error('Please define the NEXTAUTH_SECRET environment variable')
}

// Cleanup old login attempts
async function cleanupOldLoginAttempts(db: Db) {
  try {
    await db.collection('loginAttempts').deleteMany({
      timestamp: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Older than 24 hours
    })
  } catch (error) {
    console.error('Failed to cleanup old login attempts:', error)
  }
}

async function logFailedAttempt(db: Db, email: string) {
  await db.collection('loginAttempts').insertOne({
    email,
    timestamp: new Date(),
    success: false
  })
  
  // Cleanup old attempts periodically
  if (Math.random() < 0.1) { // 10% chance to trigger cleanup
    await cleanupOldLoginAttempts(db)
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        if (!credentials?.username || !credentials?.password) {
          throw new Error('Please provide both username and password')
        }

        try {
          const { db } = await connectToDatabase()
          const user = await db.collection('users').findOne({ username: credentials.username })

          if (!user) {
            throw new Error('No user found with this username')
          }

          const isValid = await bcrypt.compare(credentials.password, user.password)

          if (!isValid) {
            throw new Error('Invalid password')
          }

          // Generate a unique session ID
          const sessionId = crypto.randomUUID()

          const sessionLog: SessionLog = {
            loginTime: new Date(),
            userAgent: req.headers?.['user-agent'] || 'unknown',
            ip: req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || 'unknown',
            sessionId
          }

          // Update user's session log
          await db.collection('users').updateOne(
            { _id: new ObjectId(user._id) },
            {
              $set: { 
                lastLogin: new Date(),
                lastActivityAt: new Date()
              },
              $push: { 
                sessionsLog: { 
                  $each: [sessionLog],
                  $slice: -10 
                }
              } as any // Type assertion needed for MongoDB operations
            }
          )

          return {
            id: user._id.toString(),
            email: user.email,
            role: user.role,
            username: user.username,
            name: user.username,
            sessionId
          }
        } catch (error) {
          console.error('Authentication error:', error)
          throw error
        }
      }
    })
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.username = user.username
        token.sessionId = user.sessionId
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.role = token.role
        session.user.username = token.username
        session.user.sessionId = token.sessionId
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      // Handle redirect after sign in
      if (url.startsWith('/api/auth/session')) {
        const session = await fetch(`${baseUrl}/api/auth/session`).then(res => res.json())
        if (session?.user?.role) {
          const dashboardRoutes = {
            admin: '/allDashboards/admin',
            transcriber: '/allDashboards/transcriber',
            translator: '/allDashboards/translator',
            voiceOver: '/allDashboards/voice-over'
          }
          return `${baseUrl}${dashboardRoutes[session.user.role] || dashboardRoutes.admin}`
        }
      }
      return url.startsWith(baseUrl) ? url : baseUrl
    }
  },
  events: {
    async signIn({ user, account }) {
      console.log('User signed in:', {
        userId: user.id,
        username: user.username,
        role: user.role,
        timestamp: new Date().toISOString()
      })
    },
    async signOut({ token }) {
      try {
        const { db } = await connectToDatabase()
        
        // Update last logout time and activity
        await db.collection('users').updateOne(
          { _id: new ObjectId(token.sub) },
          {
            $set: {
              lastLogout: new Date(),
              lastActivityAt: new Date()
            }
          }
        )
      } catch (error) {
        console.error('Error updating logout time:', error)
      }
    }
  },
  debug: process.env.NODE_ENV === 'development'
} 