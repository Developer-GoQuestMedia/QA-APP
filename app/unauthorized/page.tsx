'use client'

import { signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export default function UnauthorizedPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const handleReturnToLogin = async () => {
    try {
      // Clear React Query cache
      queryClient.clear()

      // Clear localStorage
      localStorage.clear()

      // Clear sessionStorage
      sessionStorage.clear()

      // Clear cookies and session
      await signOut({ 
        redirect: false,
        callbackUrl: '/login'
      })

      // Clear service worker caches if any exist
      if ('caches' in window) {
        const cacheKeys = await caches.keys()
        await Promise.all(
          cacheKeys.map(key => caches.delete(key))
        )
      }

      // Redirect to login
      router.push('/login')
    } catch (error) {
      console.error('Error during logout:', error)
      // Fallback to direct navigation if something fails
      window.location.href = '/login'
    }
  }

  // Clear caches on component mount
  useEffect(() => {
    queryClient.clear()
  }, [queryClient])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            Unauthorized Access
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            You do not have permission to access this resource. Please contact your administrator if you believe this is an error.
          </p>
        </div>
        <div className="mt-8 space-y-6">
          <div>
            <button
              onClick={handleReturnToLogin}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Return to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  )
} 