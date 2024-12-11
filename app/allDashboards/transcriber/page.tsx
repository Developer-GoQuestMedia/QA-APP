'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import TranscriberView from '@/components/TranscriberView'
import { useProjects } from '@/hooks/useProjects'

export default function TranscriberDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { data: projects, isLoading: isLoadingProjects } = useProjects()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session?.user?.role !== 'transcriber') {
      // Redirect if user is not a transcriber
      router.push('/login')
    }
  }, [status, session, router])

  if (status === 'loading' || isLoadingProjects) {
    return <div>Loading...</div>
  }

  if (!session) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <TranscriberView projects={projects || []} />
    </div>
  )
} 