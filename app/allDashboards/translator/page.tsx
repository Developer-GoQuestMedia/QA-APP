'use client'

import { useSession } from 'next-auth/react'
import TranslatorView from '@/components/Translator/TranslatorView'
import { useProjects } from '@/hooks/useProjects'
import LoadingState from '@/components/LoadingState'
import ErrorState from '@/components/ErrorState'

export default function TranslatorDashboard() {
  const { data: session, status } = useSession()
  const { 
    data: projects, 
    isLoading: isLoadingProjects, 
    error: projectsError,
    refetch: refetchProjects 
  } = useProjects()

  if (status === 'loading' || isLoadingProjects) {
    return (
      <LoadingState 
        message={status === 'loading' ? 'Loading session...' : 'Loading projects...'} 
      />
    )
  }

  if (projectsError) {
    return (
      <ErrorState
        message={projectsError instanceof Error ? projectsError.message : 'Failed to load projects'}
        onRetry={() => refetchProjects()}
      />
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <TranslatorView projects={projects || []} />
    </div>
  )
} 