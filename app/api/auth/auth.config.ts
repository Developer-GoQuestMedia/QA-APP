import CredentialsProvider from 'next-auth/providers/credentials'
import { connectToDatabase } from '@/lib/mongodb'
import bcrypt from 'bcryptjs'
import type { NextAuthOptions } from 'next-auth'
import crypto from 'crypto'

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error('Please define the NEXTAUTH_SECRET environment variable')
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Please enter your email and password')
        }

        try {
          const { db } = await connectToDatabase()
          const user = await db.collection('users').findOne({ 
            email: credentials.email 
          })

          if (!user) {
            throw new Error('Invalid email or password')
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          )

          if (!isPasswordValid) {
            throw new Error('Invalid email or password')
          }

          // Update last login and sessions log
          const sessionId = crypto.randomUUID();
          const sessionLog = {
            loginTime: new Date(),
            userAgent: req.headers?.['user-agent'] || 'unknown',
            sessionId
          }

          await db.collection('users').updateOne(
            { _id: user._id },
            {
              $set: { 
                lastLogin: new Date(),
                'sessionsLog.0': sessionLog
              }
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
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.role = user.role
        token.username = user.username
        token.sessionId = user.sessionId
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.role = token.role as string
        session.user.username = token.username as string
        session.user.name = token.name as string
        session.user.sessionId = token.sessionId as string
      }
      return session
    }
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
} 