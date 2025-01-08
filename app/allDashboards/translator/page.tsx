'use client'

import { useSession } from 'next-auth/react'
import TranslatorView from '@/components/TranslatorView'
import { useProjects } from '@/hooks/useProjects'

export default function TranslatorDashboard() {
  const { data: session, status } = useSession()
  const { data: projects, isLoading: isLoadingProjects } = useProjects()

  if (status === 'loading' || isLoadingProjects) {
    return <div>Loading...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <TranslatorView projects={projects || []} />
    </div>
  )
} 