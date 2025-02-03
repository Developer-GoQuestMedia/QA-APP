'use client'

import { useSession } from 'next-auth/react'
import VoiceOverView from '@/components/VoiceOverView'
import { useProjects } from '@/hooks/useProjects'
import { Project } from '@/types/project'

export default function VoiceOverDashboard() {
  const { data: session, status } = useSession()
  const { data: projects, isLoading: isLoadingProjects } = useProjects()

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
    return <div>Loading...</div>
  }

  console.log('Dashboard ready to render:', {
    authenticated: !!session,
    role: session?.user?.role
  })

  // Ensure projects is an array and has all required properties
  const validProjects: Project[] = (projects || []).map(project => ({
    ...project,
    dialogue_collection: project.dialogue_collection || null,
    updatedAt: project.updatedAt || new Date().toISOString(),
    parentFolder: project.parentFolder || '',
    databaseName: project.databaseName || '',
    episodes: project.episodes || [],
    uploadStatus: project.uploadStatus || {
      totalFiles: 0,
      completedFiles: 0,
      currentFile: 0,
      status: 'pending'
    }
  }))

  return (
    <div className="min-h-screen bg-background">
      <VoiceOverView projects={validProjects} />
    </div>
  )
} 