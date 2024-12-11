'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function DashboardRouter() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session?.user?.role) {
      // Redirect based on role
      if (session.user.role === 'admin') {
        router.push('/allDashboards/admin')
      } else {
        const roleRoute = session.user.role === 'voice-over' ? 'voice-over' : session.user.role
        router.push(`/allDashboards/${roleRoute}`)
      }
    }
  }, [status, session, router])

  if (status === 'loading') {
    return <div>Loading...</div>
  }

  return null
} 