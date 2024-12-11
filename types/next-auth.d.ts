import 'next-auth'
import { JWT } from 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      username: string
      role: string
      email: string | null
      name?: string | null
      image?: string | null
    }
  }

  interface User {
    id: string
    username: string
    role: string
    email?: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    username: string
    role: string
    email?: string | null
  }
} 