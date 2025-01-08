'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import ThemeToggle from '../components/ThemeToggle'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

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
        redirect: true,
        callbackUrl: '/allDashboards'
      })

      console.log('SignIn result:', {
        timestamp: new Date().toISOString(),
        success: !result?.error,
        hasError: !!result?.error,
        error: result?.error,
        callbackUrl: '/allDashboards'
      })

      if (result?.error) {
        console.error('Login error from NextAuth:', {
          error: result.error,
          timestamp: new Date().toISOString()
        })
        setError(result.error)
      } else {
        console.log('Login successful, redirecting to dashboard')
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

