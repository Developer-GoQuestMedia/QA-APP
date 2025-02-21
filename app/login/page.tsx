'use client'

import { useState, useEffect } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import axios from 'axios'
import ThemeToggle from '../components/ThemeToggle'

// Update the route type to use Next.js route type
type AppRoute = 
  | '/allDashboards/admin'
  | '/allDashboards/director'
  | '/allDashboards/srDirector'
  | '/allDashboards/transcriber'
  | '/allDashboards/translator'
  | '/allDashboards/voice-over'
  | '/unauthorized'

const dashboardRoutes = {
  admin: '/allDashboards/admin',
  director: '/allDashboards/director',
  srDirector: '/allDashboards/srDirector',
  transcriber: '/allDashboards/transcriber',
  translator: '/allDashboards/translator',
  voiceOver: '/allDashboards/voice-over'
} as const

type UserRole = keyof typeof dashboardRoutes

// Helper function to handle route navigation safely
const navigateToRoute = (router: ReturnType<typeof useRouter>, path: AppRoute | '/unauthorized') => {
  router.push(path)
}

// Helper function to get redirect path based on role
const getRoleBasedRedirectPath = (role: string): AppRoute => {
  if (role in dashboardRoutes) {
    return dashboardRoutes[role as UserRole] as AppRoute;
  }
  console.error('Invalid role for redirect:', role);
  return '/unauthorized';
};

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const router = useRouter()
  const { data: session, status, update } = useSession()

  // Debug logging for session state changes
  useEffect(() => {
    console.log('[Session Debug]', {
      timestamp: new Date().toISOString(),
      status,
      hasSession: !!session,
      userRole: session?.user?.role,
      currentPath: window.location.pathname
    })
  }, [session, status])

  // Handle client-side initialization
  useEffect(() => {
    const startTime = performance.now()
    setIsClient(true)
    console.log('[Client Init]', {
      timestamp: new Date().toISOString(),
      timeToInit: `${(performance.now() - startTime).toFixed(2)}ms`,
      currentPath: window.location.pathname
    })
  }, [])

  const handleNavigation = async (role: string) => {
    try {
      const redirectPath = getRoleBasedRedirectPath(role)
      console.log('[Navigation Attempt]', {
        timestamp: new Date().toISOString(),
        redirectPath,
        currentPath: window.location.pathname,
        method: 'direct'
      })
      
      // Force a hard navigation
      window.location.href = redirectPath
    } catch (err) {
      console.error('[Navigation Error]', {
        timestamp: new Date().toISOString(),
        error: err,
        currentPath: window.location.pathname
      })
    }
  }

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
        redirect: false
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

      // Force session update after successful login
      const updateStartTime = performance.now()
      console.log('[Session Update Start]', {
        timestamp: new Date().toISOString(),
        currentPath: window.location.pathname
      })
      
      await update()

      // Get the updated session
      const updatedSession = await fetch('/api/auth/session')
      const sessionData = await updatedSession.json()
      
      console.log('[Session Update Complete]', {
        timestamp: new Date().toISOString(),
        timeToUpdate: `${(performance.now() - updateStartTime).toFixed(2)}ms`,
        totalLoginTime: `${(performance.now() - loginStartTime).toFixed(2)}ms`,
        currentPath: window.location.pathname,
        sessionData
      })

      // Immediately navigate if we have a role
      if (sessionData?.user?.role) {
        await handleNavigation(sessionData.user.role)
      } else {
        console.error('[Session Error]', {
          timestamp: new Date().toISOString(),
          error: 'No role found in session after update',
          sessionData
        })
      }

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

  // Show loading state during initial client-side render
  if (!isClient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="p-8 rounded-lg shadow-lg w-full max-w-md">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-300 rounded w-3/4 mx-auto"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-300 rounded"></div>
              <div className="h-10 bg-gray-300 rounded"></div>
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-300 rounded"></div>
              <div className="h-10 bg-gray-300 rounded"></div>
            </div>
            <div className="h-10 bg-gray-300 rounded"></div>
          </div>
        </div>
      </div>
    )
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

