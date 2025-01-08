'use client'

import { useSession } from 'next-auth/react'
import DirectorView from '@/components/DirectorView'
import { useProjects } from '@/hooks/useProjects'

export default function DirectorDashboard() {
  const { data: session, status } = useSession()
  const { data: projects, isLoading: isLoadingProjects } = useProjects()

  if (status === 'loading' || isLoadingProjects) {
    return <div>Loading...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <DirectorView projects={projects || []} />
    </div>
  )
} 