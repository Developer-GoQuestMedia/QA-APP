'use client'

import { useSession } from 'next-auth/react'
import VoiceOverView from '@/components/VoiceOver/VoiceOverView'
import { useProjects } from '@/hooks/useProjects'
import { type Project } from '@/types/project'
import LoadingState from '@/components/LoadingState'
import ErrorState from '@/components/ErrorState'

export default function VoiceOverDashboard() {
  const { data: session, status } = useSession()
  const { 
    data: projects, 
    isLoading: isLoadingProjects, 
    error: projectsError,
    refetch: refetchProjects 
  } = useProjects()

  console.log('VoiceOver Dashboard Render:', {
    sessionStatus: status,
    userRole: session?.user?.role,
    username: session?.user?.username,
    projectsLoaded: !!projects,
    projectCount: projects?.length
  })

  if (status === 'loading' || isLoadingProjects) {
    console.log('Dashboard loading state:', {
      sessionLoading: status === 'loading',
      projectsLoading: isLoadingProjects
    })
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

  console.log('Dashboard ready to render:', {
    authenticated: !!session,
    role: session?.user?.role
  })

  // Ensure projects is an array and has all required properties
  const validProjects: Project[] = (projects || []).map((project: Project) => ({
    ...project,
    dialogue_collection: project.dialogue_collection || null,
    updatedAt: project.updatedAt || new Date().toISOString(),
    status: project.status || 'pending',
    assignedUsers: project.assignedUsers || [],
    episodes: project.episodes || []
  }))

  return (
    <div className="min-h-screen bg-background">
      <VoiceOverView projects={validProjects} />
    </div>
  )
} 