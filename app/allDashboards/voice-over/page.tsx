'use client'

import { useSession } from 'next-auth/react'
import VoiceOverView from '@/components/VoiceOver/VoiceOverView'
import { useProjects } from '@/hooks/useProjects'
import { type Project } from '@/types/project'
import LoadingState from '@/components/LoadingState'
import ErrorState from '@/components/ErrorState'
import { useMemo, useEffect } from 'react'

export default function VoiceOverDashboard() {
  const { data: session, status } = useSession()
  const { 
    data: projects, 
    isLoading: isLoadingProjects, 
    error: projectsError,
    refetch: refetchProjects 
  } = useProjects()

  // Memoize the loading state check
  const isLoading = useMemo(() => 
    status === 'loading' || isLoadingProjects, 
    [status, isLoadingProjects]
  )

  // Memoize the error state
  const error = useMemo(() => {
    if (!projectsError) return null
    return projectsError instanceof Error ? projectsError.message : 'Failed to load projects'
  }, [projectsError])

  // Only log on state changes
  useEffect(() => {
    console.log('VoiceOver Dashboard State:', {
      sessionStatus: status,
      userRole: session?.user?.role,
      username: session?.user?.username,
      projectsLoaded: !!projects,
      projectCount: projects?.length,
      isLoading,
      hasError: !!error
    })
  }, [status, session, projects, isLoading, error])

  if (isLoading) {
    return (
      <LoadingState 
        message={status === 'loading' ? 'Loading session...' : 'Loading projects...'} 
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => refetchProjects()}
      />
    )
  }

  if (!session || !projects) {
    return <ErrorState message="Session or projects not available" />
  }

  // Ensure projects is an array and has all required properties
  const validProjects: Project[] = (projects || []).map((project: Project) => ({
    ...project,
    updatedAt: project.updatedAt || new Date(),
    status: project.status || 'pending',
    assignedTo: project.assignedTo || [],
    episodes: project.episodes || []
  }))

  return (
    <div className="min-h-screen bg-background">
      <VoiceOverView projects={validProjects} />
    </div>
  )
} 