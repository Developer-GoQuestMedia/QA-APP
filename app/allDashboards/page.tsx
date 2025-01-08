'use client'

import { useSession } from 'next-auth/react'

export default function DashboardRouter() {
  const { status } = useSession()

  if (status === 'loading') {
    return <div>Loading...</div>
  }

  return null
} 