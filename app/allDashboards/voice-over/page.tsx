'use client'

import { useSession } from 'next-auth/react'
import VoiceOverView from '@/components/VoiceOverView'
import { useProjects } from '@/hooks/useProjects'

export default function VoiceOverDashboard() {
  const { data: session, status } = useSession()
  const { data: projects, isLoading: isLoadingProjects } = useProjects()

  if (status === 'loading' || isLoadingProjects) {
    return <div>Loading...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <VoiceOverView projects={projects || []} />
    </div>
  )
} 