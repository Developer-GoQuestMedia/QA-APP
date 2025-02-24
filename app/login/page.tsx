'use client'

import { useState, useEffect, useCallback } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import ThemeToggle from '../components/ThemeToggle'

// Define the dashboard routes first as a const
const dashboardRoutes = {
  admin: '/allDashboards/admin',
  transcriber: '/allDashboards/transcriber',
  translator: '/allDashboards/translator',
  voiceOver: '/allDashboards/voice-over'
} as const;

// Derive the route type from the dashboardRoutes object
type AppRoute = typeof dashboardRoutes[keyof typeof dashboardRoutes];

type UserRole = keyof typeof dashboardRoutes;

// Helper function to get redirect path based on role
const getRoleBasedRedirectPath = (role: string): AppRoute => {
  if (role in dashboardRoutes) {
    return dashboardRoutes[role as UserRole];
  }
  console.error('Invalid role for redirect:', role);
  return dashboardRoutes.admin;
};

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { data: session } = useSession()

  // Debug logging for session state changes
  useEffect(() => {
    console.log('[Session Debug]', {
      timestamp: new Date().toISOString(),
      hasSession: !!session,
      userRole: session?.user?.role,
      currentPath: window.location.pathname
    })
  }, [session])

  // Handle client-side initialization
  useEffect(() => {
    const startTime = performance.now()
    console.log('[Client Init]', {
      timestamp: new Date().toISOString(),
      timeToInit: `${(performance.now() - startTime).toFixed(2)}ms`,
      currentPath: window.location.pathname
    })
  }, [])

  // Memoized navigation function
  const handleNavigation = useCallback(async (role: string) => {
    try {
      const redirectPath = getRoleBasedRedirectPath(role)
      console.log('[Navigation Attempt]', {
        timestamp: new Date().toISOString(),
        redirectPath,
        currentPath: window.location.pathname,
        method: 'router'
      })
      
      await router.push(redirectPath)
    } catch (err) {
      console.error('[Navigation Error]', {
        timestamp: new Date().toISOString(),
        error: err,
        currentPath: window.location.pathname
      })
      throw err
    }
  }, [router])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!username || !password) return

    const loginStartTime = performance.now()
    console.log('[Login Start]', {
      timestamp: new Date().toISOString(),
      username,
      currentPath: window.location.pathname
    })

    try {
      setError('')
      setIsLoading(true)

      const signInStartTime = performance.now()
      const result = await signIn('credentials', {
        username,
        password,
        redirect: false,
        callbackUrl: '/api/auth/session' // Add callback URL
      })

      console.log('[SignIn Complete]', {
        timestamp: new Date().toISOString(),
        hasError: !!result?.error,
        timeToSignIn: `${(performance.now() - signInStartTime).toFixed(2)}ms`,
        currentPath: window.location.pathname
      })

      if (result?.error) {
        setError('Invalid username or password')
        return
      }

      // Immediately try to get the session after successful sign in
      const sessionResponse = await fetch('/api/auth/session')
      const sessionData = await sessionResponse.json()

      if (sessionData?.user?.role) {
        console.log('[Session Available]', {
          timestamp: new Date().toISOString(),
          role: sessionData.user.role
        })
        
        const redirectPath = getRoleBasedRedirectPath(sessionData.user.role)
        
        // Use window.location for a hard redirect
        window.location.href = redirectPath
        return
      }

      // If no immediate session, try with retries
      let retryCount = 0
      const maxRetries = 3
      const retryDelay = 1000

      while (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay))
        
        const updatedSession = await fetch('/api/auth/session')
        const retrySessionData = await updatedSession.json()

        if (retrySessionData?.user?.role) {
          console.log('[Session Updated]', {
            timestamp: new Date().toISOString(),
            role: retrySessionData.user.role,
            attempt: retryCount + 1
          })

          const redirectPath = getRoleBasedRedirectPath(retrySessionData.user.role)
          window.location.href = redirectPath
          return
        }

        console.log('[Session Retry]', {
          timestamp: new Date().toISOString(),
          attempt: retryCount + 1,
          maxRetries
        })

        retryCount++
      }

      console.error('[Session Error]', {
        timestamp: new Date().toISOString(),
        error: 'Failed to get session after maximum retries',
        retryAttempts: retryCount
      })
      setError('Failed to complete login. Please try again.')

    } catch (err) {
      console.error('[Login Error]', {
        timestamp: new Date().toISOString(),
        error: err,
        timeElapsed: `${(performance.now() - loginStartTime).toFixed(2)}ms`,
        currentPath: window.location.pathname
      })
      setError('An error occurred during login')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="absolute p-8 top-0 right-0">
        <ThemeToggle />
      </div>
      <div className="bg-card p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6 text-foreground">Login to QA App</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-foreground mb-1">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-2 rounded-md border bg-background text-foreground"
              required
              suppressHydrationWarning
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 rounded-md border bg-background text-foreground"
              required
              suppressHydrationWarning
            />
          </div>
          {error && (
            <div className="text-red-500 text-sm text-center">{error}</div>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-2 rounded-md text-white transition-colors ${
              isLoading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-primary hover:bg-primary/90'
            }`}
            suppressHydrationWarning
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
