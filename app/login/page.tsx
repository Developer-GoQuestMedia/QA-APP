'use client'

import { useState, useEffect } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import ThemeToggle from '../components/ThemeToggle'

const dashboardRoutes = {
  admin: '/allDashboards/admin',
  director: '/allDashboards/director',
  srDirector: '/allDashboards/srDirector',
  transcriber: '/allDashboards/transcriber',
  translator: '/allDashboards/translator',
  voiceOver: '/allDashboards/voice-over'
} as const

type UserRole = keyof typeof dashboardRoutes

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { data: session, status } = useSession()

  useEffect(() => {
    // If we're already authenticated, redirect to the appropriate dashboard
    if (status === 'authenticated' && session?.user?.role) {
      const userRole = session.user.role as UserRole
      if (userRole in dashboardRoutes) {
        const route = dashboardRoutes[userRole]
        router.push(route)
      }
    }
  }, [status, session, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Login attempt initiated:', { 
      username,
      timestamp: new Date().toISOString(),
      userAgent: window.navigator.userAgent
    })
    setIsLoading(true)
    setError('')

    try {
      console.log('Calling NextAuth signIn with credentials')
      const result = await signIn('credentials', {
        username,
        password,
        redirect: false
      })

      console.log('SignIn result:', {
        timestamp: new Date().toISOString(),
        success: !result?.error,
        hasError: !!result?.error,
        error: result?.error,
      })

      if (result?.error) {
        console.error('Login error from NextAuth:', {
          error: result.error,
          timestamp: new Date().toISOString()
        })
        setError('Invalid username or password')
      } else {
        console.log('Login successful, fetching user data')
        
        // Add retry logic for fetching user data
        let retryCount = 0;
        const maxRetries = 3;
        const retryDelay = 1000; // 1 second

        while (retryCount < maxRetries) {
          try {
            // Get user data including session ID
            const response = await axios.get('/api/users/me')
            const userRole = response.data.role as UserRole
            const sessionId = response.data.sessionId

            console.log('User data fetched:', {
              role: userRole,
              sessionId,
              timestamp: new Date().toISOString(),
              retryAttempt: retryCount
            })

            if (userRole in dashboardRoutes) {
              const route = dashboardRoutes[userRole]
              // Store session ID in localStorage for session tracking
              localStorage.setItem('sessionId', sessionId)
              // Use router.push for navigation
              router.push(route)
              return; // Exit on success
            } else {
              setError('Invalid role configuration')
              break;
            }
          } catch (err) {
            retryCount++;
            if (retryCount === maxRetries) {
              throw err; // Throw on final retry
            }
            console.log(`Retry attempt ${retryCount} for fetching user data`)
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error('Unexpected login error:', {
        error: errorMessage,
        timestamp: new Date().toISOString(),
        type: err instanceof Error ? err.constructor.name : typeof err
      })
      setError('An error occurred during login')
    } finally {
      console.log('Login attempt completed:', {
        timestamp: new Date().toISOString(),
        success: !error,
        username
      })
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      
      <div className="bg-card p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6 text-foreground">Login</h1>
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
            />
          </div>
          {error && (
            <div className="text-red-500 text-sm text-center">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-2 rounded-md text-white transition-colors ${
              isLoading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-primary hover:bg-primary/90'
            }`}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}

