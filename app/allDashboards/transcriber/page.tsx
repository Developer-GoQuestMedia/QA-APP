'use client'

import { useSession } from 'next-auth/react'
import TranscriberView from '@/components/TranscriberView'
import { useProjects } from '@/hooks/useProjects'

export default function TranscriberDashboard() {
  const { data: session, status } = useSession()
  const { data: projects, isLoading: isLoadingProjects } = useProjects()

  if (status === 'loading' || isLoadingProjects) {
    return <div>Loading...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <TranscriberView projects={projects || []} />
    </div>
  )
} 