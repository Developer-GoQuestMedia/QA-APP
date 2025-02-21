'use client'

import { SessionProvider } from 'next-auth/react'
import { useEffect } from 'react'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Migrate any auth data from localStorage to sessionStorage
    const authKeys = [
      'sessionId',
      'user',
      'role',
      'lastActivity',
      'next-auth.session-token',
      'next-auth.callback-url',
      'next-auth.csrf-token'
    ]

    authKeys.forEach(key => {
      try {
        const value = localStorage.getItem(key)
        if (value) {
          sessionStorage.setItem(key, value)
          localStorage.removeItem(key)
        }
      } catch (e) {
        console.warn(`Failed to migrate ${key} to sessionStorage:`, e)
      }
    })
  }, [])

  return <SessionProvider>{children}</SessionProvider>
} 