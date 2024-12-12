'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import VoiceOverView from '@/components/VoiceOverView'
import { useProjects } from '@/hooks/useProjects'

export default function VoiceOverDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { data: projects, isLoading: isLoadingProjects } = useProjects()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session?.user?.role !== 'voice-over') {
      // Redirect if user is not a voice-over artist
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
      <VoiceOverView projects={projects || []} />
    </div>
  )
} 