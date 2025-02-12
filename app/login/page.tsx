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
  const [sessionCleared, setSessionCleared] = useState(false)
  const router = useRouter()
  const { data: session, status } = useSession()

  useEffect(() => {
    // Only clear session once and if we're not already logged out
    if (!sessionCleared && status !== 'unauthenticated') {
      const clearOldSession = async () => {
        try {
          setSessionCleared(true) // Mark as cleared to prevent loops
          await signOut({ redirect: false })
          await axios.post('/api/auth/logout')
          localStorage.clear()
          sessionStorage.clear()
        } catch (error) {
          console.error('Error clearing session:', error)
        }
      }

      clearOldSession()
    }
  }, [status, sessionCleared])

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
        console.log('Login successful, redirecting to dashboard')
        // Redirect based on role
        const response = await axios.get('/api/users/me')
        const userRole = response.data.role as UserRole

        if (userRole in dashboardRoutes) {
          const route = dashboardRoutes[userRole]
          window.location.href = route
        } else {
          setError('Invalid role configuration')
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

