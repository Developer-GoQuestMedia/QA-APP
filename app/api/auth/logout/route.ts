import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
  // Log the logout attempt
  console.log('Logout initiated:', {
    timestamp: new Date().toISOString()
  })

  const response = NextResponse.json(
    { 
      success: true,
      message: 'Logged out successfully',
      timestamp: new Date().toISOString()
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }
  )

  // Clear all auth-related cookies
  const cookieOptions = {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 0
  }

  // Clear cookies in the response
  response.cookies.set('next-auth.session-token', '', cookieOptions)
  response.cookies.set('__Secure-next-auth.session-token', '', cookieOptions)
  response.cookies.set('next-auth.callback-url', '', cookieOptions)
  response.cookies.set('__Secure-next-auth.callback-url', '', cookieOptions)
  response.cookies.set('next-auth.csrf-token', '', cookieOptions)
  response.cookies.set('__Host-next-auth.csrf-token', '', cookieOptions)
  response.cookies.set('__Secure-next-auth.pkce.code_verifier', '', cookieOptions)
  response.cookies.set('next-auth.pkce.code_verifier', '', cookieOptions)

  return response
} 