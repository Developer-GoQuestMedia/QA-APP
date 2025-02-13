'use client'

import { useEffect, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function SystemInit() {
  const { data: session, status } = useSession()
  const [hasCleared, setHasCleared] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const initSystem = async () => {
      console.log('System initialization started:', {
        timestamp: new Date().toISOString(),
        sessionStatus: status,
        sessionData: session ? { user: session.user, expires: session.expires } : null
      })

      if (status === 'loading') {
        console.log('Session is still loading, waiting for authentication...');
        return
      }

      try {
        // Only clear auth tokens if the session is unauthenticated
        if (status === 'unauthenticated' && !hasCleared) {
          console.log('Unauthenticated session detected, clearing session tokens.')

          // Clear any existing auth tokens from localStorage
          localStorage.removeItem('next-auth.session-token')
          localStorage.removeItem('next-auth.callback-url')
          localStorage.removeItem('next-auth.csrf-token')

          // Prevent repeated signouts
          setHasCleared(true) // Prevent further calls
          await signOut({ redirect: false })
          router.push('/login') // Redirect to login page

          console.log('Previous session cleared')
        } else if (status === 'authenticated') {
          console.log('Authenticated session detected:', {
            user: session.user,
            expires: session.expires
          })
        }

        console.log('System initialization completed:', {
          timestamp: new Date().toISOString(),
          success: true
        })
      } catch (error) {
        console.error('System initialization error:', {
          error,
          timestamp: new Date().toISOString()
        })
      }
    }

    if (status !== 'loading' && !hasCleared) {
      initSystem()
    }
  }, [status, session, router, hasCleared]) // Track the session state and prevent multiple initializations

  return null
}
