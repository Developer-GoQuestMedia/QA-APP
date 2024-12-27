'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import TranscriberView from '@/components/TranscriberView'
import TranslatorView from '@/components/TranslatorView'
import VoiceOverView from '@/components/VoiceOverView'
import DirectorView from '@/components/DirectorView'
import AdminView from '@/components/AdminView'
import { Project } from '@/types/project'
import { Session } from 'next-auth'

export default function Dashboard() {
  const { data: session, status } = useSession() as { data: Session | null, status: string }
  const router = useRouter()

  const { data: projects = [], isLoading, refetch: refetchProjects } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data } = await axios.get('/api/projects')
      return data.data.map((project: any) => ({
        ...project,
        updatedAt: new Date(project.updatedAt),
        createdAt: project.createdAt ? new Date(project.createdAt) : undefined
      }))
    },
    enabled: !!session // Only fetch when session exists
  })

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  if (status === 'loading' || isLoading) {
    return <div>Loading...</div>
  }

  if (!session) {
    return null
  }

  const renderContent = () => {
    switch (session.user.role) {
      case 'transcriber':
        return <TranscriberView projects={projects} />
      case 'translator':
        return <TranslatorView projects={projects} />
      case 'voice-over':
        return <VoiceOverView projects={projects} />
      case 'director':
        return <DirectorView projects={projects} />
      case 'admin':
        return <AdminView projects={projects} refetchProjects={refetchProjects} />
      default:
        return <div>Unknown role</div>
    }
  }

  return renderContent()
}

