'use client'

import { useState, useEffect } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import axios from 'axios'
import ThemeToggle from '../components/ThemeToggle'

// Update the route type to use Next.js route type
type DashboardRoute = 
  | '/allDashboards/admin'
  | '/allDashboards/director'
  | '/allDashboards/srDirector'
  | '/allDashboards/transcriber'
  | '/allDashboards/translator'
  | '/allDashboards/voice-over'

const dashboardRoutes = {
  admin: '/allDashboards/admin',
  director: '/allDashboards/director',
  srDirector: '/allDashboards/srDirector',
  transcriber: '/allDashboards/transcriber',
  translator: '/allDashboards/translator',
  voiceOver: '/allDashboards/voice-over'
} as const

type UserRole = keyof typeof dashboardRoutes

// Helper function to get redirect path based on role
const getRoleBasedRedirectPath = (role: string): string => {
  if (role in dashboardRoutes) {
    return dashboardRoutes[role as UserRole];
  }
  console.error('Invalid role for redirect:', role);
  return '/unauthorized';
};

// Helper function to handle route navigation safely
const navigateToRoute = (router: ReturnType<typeof useRouter>, path: string) => {
  // Using replace to avoid adding to history stack
  window.location.href = path
}

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
      const redirectPath = getRoleBasedRedirectPath(session.user.role);
      navigateToRoute(router, redirectPath);
    }
  }, [status, session, router])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    console.log('Login attempt initiated:', { timestamp: new Date().toISOString() });
    
    try {
      console.log('Calling NextAuth signIn with credentials');
      const result = await signIn('credentials', {
        username,
        password,
        redirect: false,
      });
      
      console.log('SignIn result:', {
        ok: result?.ok,
        error: result?.error,
        timestamp: new Date().toISOString()
      });

      if (result?.ok) {
        console.log('Login successful, fetching user data');
        let retryCount = 0;
        const maxRetries = 3;
        const retryDelay = 1000; // 1 second

        while (retryCount < maxRetries) {
          try {
            const response = await fetch('/api/users/session', {
              method: 'GET',
              headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
              },
              credentials: 'include'
            });

            if (response.ok) {
              const userData = await response.json();
              console.log('User data fetched successfully:', {
                role: userData.role,
                username: userData.username,
                timestamp: new Date().toISOString()
              });
              
              const redirectPath = getRoleBasedRedirectPath(userData.role);
              navigateToRoute(router, redirectPath);
              return;
            } else {
              console.log(`Retry attempt ${retryCount + 1} for fetching user data:`, {
                status: response.status,
                statusText: response.statusText,
                timestamp: new Date().toISOString()
              });
              retryCount++;
              if (retryCount < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              }
            }
          } catch (error) {
            console.error('Error fetching user data:', {
              error: error instanceof Error ? error.message : 'Unknown error',
              attempt: retryCount + 1,
              timestamp: new Date().toISOString()
            });
            retryCount++;
            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
          }
        }
        
        console.error('Failed to fetch user data after retries');
        setError('Failed to complete login process. Please try again.');
      } else {
        console.error('Login failed:', {
          error: result?.error,
          timestamp: new Date().toISOString()
        });
        setError(result?.error || 'Invalid credentials');
      }
    } catch (error) {
      console.error('Unexpected login error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        type: error instanceof Error ? error.constructor.name : typeof error,
        timestamp: new Date().toISOString()
      });
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
      console.log('Login attempt completed:', { timestamp: new Date().toISOString() });
    }
  };

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

