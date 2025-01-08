'use client'

import { useSession } from 'next-auth/react'
import VoiceOverView from '@/components/VoiceOverView'
import { useProjects } from '@/hooks/useProjects'

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

  return (
    <div className="min-h-screen bg-background">
      <VoiceOverView projects={projects || []} />
    </div>
  )
} 