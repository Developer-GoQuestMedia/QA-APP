import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { connectToDatabase } from './mongodb'
import bcrypt from 'bcryptjs'
import { UserRole } from '@/types/user'

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error('Please define the NEXTAUTH_SECRET environment variable')
}

// Define available roles
export const availableRoles = [
  'admin',
  'director',
  'srDirector',
  'voiceOver',
  'transcriber',
  'translator'
] as const;

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
          throw new Error('Please enter your username and password')
        }

        try {
          const { db } = await connectToDatabase()
          const user = await db.collection('users').findOne({ username: credentials.username })

          console.log('User lookup result:', {
            found: !!user,
            role: user?.role,
            username: user?.username,
            timestamp: new Date().toISOString()
          })

          if (!user) {
            console.log('Authentication failed: User not found', {
              attemptedUsername: credentials.username,
              timestamp: new Date().toISOString()
            })
            throw new Error('Invalid username or password')
          }

          const isPasswordValid = await bcrypt.compare(credentials.password, user.password)
          console.log('Password validation:', { 
            isValid: isPasswordValid,
            username: user.username,
            timestamp: new Date().toISOString()
          })

          if (!isPasswordValid) {
            console.log('Authentication failed: Invalid password', {
              username: user.username,
              timestamp: new Date().toISOString()
            })
            throw new Error('Invalid username or password')
          }

          // Validate role is in available roles
          if (!availableRoles.includes(user.role as any)) {
            console.error('Invalid role mapping:', {
              userRole: user.role,
              availableRoles,
              timestamp: new Date().toISOString()
            })
            throw new Error('Invalid role configuration')
          }

          // Update last login and session log
          const now = new Date()
          const sessionLog = {
            loginTime: now,
            userAgent: req.headers?.['user-agent'] || 'unknown',
            sessionId: crypto.randomUUID() // Add unique session ID
          }

          const role = user.role as UserRole
          console.log('Role validation:', {
            role,
            username: user.username,
            timestamp: new Date().toISOString()
          })

          // First ensure sessionsLog exists and user is active
          await db.collection('users').updateOne(
            { _id: user._id },
            { 
              $set: { 
                lastLogin: now,
                isActive: true,
                lastActivityAt: now
              },
              $setOnInsert: { 
                sessionsLog: [] 
              }
            },
            { upsert: true }
          )

          // Then update the session log
          const sessionLogEntry = {
            loginTime: new Date(),
            userAgent: req.headers?.['user-agent'] || 'unknown',
            sessionId: sessionLog.sessionId
          };

          await db.collection('users').updateOne(
            { _id: user._id },
            { 
              $push: { 
                sessionsLog: {
                  $each: [sessionLogEntry],
                  $slice: -100 // Keep only the last 100 sessions
                }
              }
            } as any // Type assertion needed for MongoDB operation
          )

          const userData = {
            id: user._id.toString(),
            username: user.username,
            role: role,
            email: user.email,
            sessionId: sessionLog.sessionId // Include session ID in user data
          }

          console.log('Authentication successful:', {
            username: userData.username,
            role: userData.role,
            sessionId: userData.sessionId,
            timestamp: new Date().toISOString()
          })

          return userData
        } catch (error) {
          console.error('Authentication error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            type: error instanceof Error ? error.constructor.name : typeof error,
            timestamp: new Date().toISOString(),
            username: credentials.username
          })
          throw error
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        console.log('JWT generation:', {
          username: user.username,
          role: user.role,
          sessionId: user.sessionId,
          timestamp: new Date().toISOString()
        })
        token.id = user.id
        token.username = user.username
        token.role = user.role
        token.email = user.email
        token.sessionId = user.sessionId
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        console.log('Session creation:', {
          username: token.username,
          role: token.role,
          sessionId: token.sessionId,
          timestamp: new Date().toISOString()
        })
        session.user = {
          ...session.user,
          id: token.id as string,
          username: token.username as string,
          role: token.role as string,
          email: token.email as string,
          sessionId: token.sessionId as string
        }
      }
      return session
    }
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // update the session every 24 hours
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production' ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        domain: process.env.NODE_ENV === 'production' ? '.vercel.app' : undefined
      }
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production'
      }
    }
  },
  pages: {
    signIn: '/login',
    error: '/login'
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
}

export const roles = [
  'transcriber',
  'translator',
  'voiceOver',
  'director',
  'srDirector',
  'admin'
] as const;

export const rolePermissions = {
  transcriber: ['transcribe'],
  translator: ['translate'],
  voiceOver: ['record'],
  director: ['review', 'approve', 'request-revision'],
  srDirector: ['review', 'approve', 'request-revision'],
  admin: ['manage-users', 'manage-projects', 'manage-roles', 'view-analytics']
} as const;  


/*import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { connectToDatabase } from './mongodb'
import bcrypt from 'bcryptjs'
import { UserRole } from '@/types/user'

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error('Please define the NEXTAUTH_SECRET environment variable')
}

// Define available roles
export const availableRoles = [
  'admin',
  'director',
  'srDirector',
  'voiceOver',
  'transcriber',
  'translator'
] as const;

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
          throw new Error('Please enter your username and password')
        }

        try {
          const { db } = await connectToDatabase()
          const user = await db.collection('users').findOne({ username: credentials.username })

          console.log('User lookup result:', {
            found: !!user,
            role: user?.role,
            username: user?.username,
            timestamp: new Date().toISOString()
          })

          if (!user) {
            console.log('Authentication failed: User not found', {
              attemptedUsername: credentials.username,
              timestamp: new Date().toISOString()
            })
            throw new Error('Invalid username or password')
          }

          const isPasswordValid = await bcrypt.compare(credentials.password, user.password)
          console.log('Password validation:', { 
            isValid: isPasswordValid,
            username: user.username,
            timestamp: new Date().toISOString()
          })

          if (!isPasswordValid) {
            console.log('Authentication failed: Invalid password', {
              username: user.username,
              timestamp: new Date().toISOString()
            })
            throw new Error('Invalid username or password')
          }

          // Validate role is in available roles
          if (!availableRoles.includes(user.role as any)) {
            console.error('Invalid role mapping:', {
              userRole: user.role,
              availableRoles,
              timestamp: new Date().toISOString()
            })
            throw new Error('Invalid role configuration')
          }

          const role = user.role as UserRole
          console.log('Role validation:', {
            role,
            username: user.username,
            timestamp: new Date().toISOString()
          })

          // Update last login and session log
          const now = new Date()
          const updateData = {
            lastLogin: now,
            isActive: true,
            [`sessionsLog.${now.getTime()}`]: {
              loginTime: now,
              userAgent: req.headers?.['user-agent'] || 'unknown'
            }
          }

          await db.collection('users').updateOne(
            { _id: user._id },
            { $set: updateData }
          )

          const userData = {
            id: user._id.toString(),
            username: user.username,
            role: role,
            email: user.email
          }

          console.log('Authentication successful:', {
            username: userData.username,
            role: userData.role,
            timestamp: new Date().toISOString()
          })

          return userData
        } catch (error) {
          console.error('Authentication error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            type: error instanceof Error ? error.constructor.name : typeof error,
            timestamp: new Date().toISOString(),
            username: credentials.username
          })
          throw error
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        console.log('JWT generation:', {
          username: user.username,
          role: user.role,
          timestamp: new Date().toISOString()
        })
        token.id = user.id
        token.username = user.username
        token.role = user.role
        token.email = user.email
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        console.log('Session creation:', {
          username: token.username,
          role: token.role,
          timestamp: new Date().toISOString()
        })
        session.user = {
          ...session.user,
          id: token.id as string,
          username: token.username as string,
          role: token.role as string,
          email: token.email as string
        }
      }
      return session
    }
  },
  pages: {
    signIn: '/login',
    error: '/login'
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60 // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development'
}

export const roles = [
  'transcriber',
  'translator',
  'voiceOver',
  'director',
  'srDirector',
  'admin'
] as const;

export const rolePermissions = {
  transcriber: ['transcribe'],
  translator: ['translate'],
  voiceOver: ['record'],
  director: ['review', 'approve', 'request-revision'],
  srDirector: ['review', 'approve', 'request-revision'],
  admin: ['manage-users', 'manage-projects', 'manage-roles', 'view-analytics']
} as const;
*/





