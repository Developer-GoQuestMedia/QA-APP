'use client'

import { useEffect } from 'react'
import { signOut, useSession } from 'next-auth/react'

export default function SystemInit() {
  const { data: session, status } = useSession()

  useEffect(() => {
    const initSystem = async () => {
      console.log('System initialization started:', {
        timestamp: new Date().toISOString(),
        sessionStatus: status
      })

      try {
        // Clear any existing auth tokens from localStorage
        localStorage.removeItem('next-auth.session-token')
        localStorage.removeItem('next-auth.callback-url')
        localStorage.removeItem('next-auth.csrf-token')
        
        // Clear any existing session if user is not authenticated
        if (status === 'unauthenticated') {
          await signOut({ redirect: false })
          console.log('Previous session cleared')
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

    initSystem()
  }, [status])

  return null
} 