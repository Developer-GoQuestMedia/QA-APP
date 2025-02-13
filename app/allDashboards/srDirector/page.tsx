'use client'

import SrDirectorView from '@/components/SrDirectorView'
import { useProjects } from '@/hooks/useProjects'

export default function SrDirectorDashboard() {
  const { data: projects, isLoading: isLoadingProjects } = useProjects()

  if (isLoadingProjects) {
    return <div>Loading...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <SrDirectorView projects={projects || []} />
    </div>
  )
} 