'use client'

import { useState, useEffect } from 'react'
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

// Helper function to handle route navigation safely
const navigateToRoute = (route: AppRoute) => {
  const router = useRouter();
  router.push(route);
};

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

      // Immediately navigate if we have a role
      if (session?.user?.role) {
        await handleNavigation(session.user.role)
      } else {
        console.error('[Session Error]', {
          timestamp: new Date().toISOString(),
          error: 'No role found in session after update',
          session
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
