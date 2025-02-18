'use client'

import { useEffect, useState, useRef } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function SystemInit() {
  const { data: session, status } = useSession()
  const [hasCleared, setHasCleared] = useState(false)
  const router = useRouter()
  const initRef = useRef(false)

  useEffect(() => {
    // Skip initialization if already done
    if (initRef.current) return;

    const initSystem = async () => {
      console.log('System initialization started:', {
        timestamp: new Date().toISOString(),
        sessionStatus: status,
        sessionData: session ? { user: session.user, expires: session.expires } : null
      })

      if (status === 'loading') {
        console.log('Session is still loading, waiting for authentication...')
        return
      }

      try {
        // Check if we're on a protected route
        const isProtectedRoute = window.location.pathname.includes('/allDashboards')
        const isLoginPage = window.location.pathname === '/login'
        
        if (status === 'authenticated') {
          console.log('Authenticated session detected:', {
            user: session.user,
            expires: session.expires
          })

          // If we're on login page and authenticated, redirect to dashboard or callback URL
          if (isLoginPage) {
            const callbackUrl = localStorage.getItem('next-auth.callback-url') || `/allDashboards/${session.user.role}`
            router.push(callbackUrl as any)
            localStorage.removeItem('next-auth.callback-url') // Clear after use
          }
        } else if (status === 'unauthenticated' && isProtectedRoute && !hasCleared) {
          console.log('Unauthenticated session detected on protected route, redirecting to login.')
          
          // Store the current URL as the callback URL
          const callbackUrl = window.location.pathname
          localStorage.setItem('next-auth.callback-url', callbackUrl)
          
          // Prevent repeated redirects
          setHasCleared(true)
          
          // Redirect to login with proper type assertion
          router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}` as any)
        }

        console.log('System initialization completed:', {
          timestamp: new Date().toISOString(),
          success: true
        })
        
        // Mark initialization as complete
        initRef.current = true
      } catch (error) {
        console.error('System initialization error:', {
          error,
          timestamp: new Date().toISOString()
        })
      }
    }

    initSystem()
  }, [status, session, router, hasCleared])

  return null
}
