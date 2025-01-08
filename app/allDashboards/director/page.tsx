'use client'

import DirectorView from '@/components/DirectorView'
import { useProjects } from '@/hooks/useProjects'

export default function DirectorDashboard() {
  const { data: projects, isLoading: isLoadingProjects } = useProjects()

  if (isLoadingProjects) {
    return <div>Loading...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <DirectorView projects={projects || []} />
    </div>
  )
} 