import { signOut } from 'next-auth/react'

export const performLogout = async () => {
  try {
    console.log('Starting logout process:', {
      timestamp: new Date().toISOString()
    })

    // Clear auth-related data from sessionStorage
    const authKeysToRemove = [
      'sessionId',
      'user',
      'role',
      'lastActivity',
      'next-auth.session-token',
      'next-auth.callback-url',
      'next-auth.csrf-token',
      '__Secure-next-auth.session-token',
      '__Host-next-auth.csrf-token'
    ]
    
    authKeysToRemove.forEach(key => {
      try {
        sessionStorage.removeItem(key)
      } catch (e) {
        console.warn(`Failed to remove sessionStorage key ${key}:`, e)
      }
    })

    // Only clear theme from localStorage if it exists
    try {
      if (localStorage.getItem('theme')) {
        const theme = localStorage.getItem('theme')
        sessionStorage.setItem('theme', theme || 'dark')
        localStorage.removeItem('theme')
      }
    } catch (e) {
      console.warn('Failed to handle theme storage:', e)
    }

    // Call our logout API endpoint
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    })

    // Sign out from NextAuth
    await signOut({
      redirect: true,
      callbackUrl: '/login'
    })

    console.log('Logout completed successfully:', {
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error during logout:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      type: error instanceof Error ? error.constructor.name : typeof error,
      timestamp: new Date().toISOString()
    })
    
    // Attempt to redirect to login even if there was an error
    window.location.href = '/login'
  }
} 