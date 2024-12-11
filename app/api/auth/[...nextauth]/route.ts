import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { connectToDatabase } from '@/lib/mongodb'
import bcrypt from 'bcryptjs'
import type { NextAuthOptions } from 'next-auth'

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
          const sessionLog = {
            loginTime: new Date(),
            userAgent: req.headers?.['user-agent'] || 'unknown'
          }

          await db.collection('users').updateOne(
            { _id: user._id },
            {
              $set: { 
                lastLogin: new Date(),
                'sessionsLog.0': sessionLog // Add to start of array
              }
            }
          )

          return {
            id: user._id.toString(),
            email: user.email,
            role: user.role,
            username: user.username,
            name: user.username
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

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }

