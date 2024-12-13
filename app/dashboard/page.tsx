'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import TranscriberView from '@/components/TranscriberView'
import TranslatorView from '@/components/TranslatorView'
import VoiceOverView from '@/components/VoiceOverView'
import DirectorView from '@/components/DirectorView'
import AdminView from '@/components/AdminView'
import { Project } from '@/types/project'

interface CustomSession {
  user: {
    username: string;
    role: string;
    email?: string;
    name?: string;
  }
}

export default function Dashboard() {
  const { data: session, status } = useSession() as { data: CustomSession | null, status: string }
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/projects')
        if (!res.ok) {
          console.error('Failed to fetch projects:', await res.text())
          return
        }
        const data = await res.json()
        // Transform dates to Date objects
        const projectsWithDates = data.map((project: any) => ({
          ...project,
          updatedAt: new Date(project.updatedAt),
          createdAt: project.createdAt ? new Date(project.createdAt) : undefined
        }))
        setProjects(projectsWithDates)
      } catch (error) {
        console.error('Error fetching projects:', error)
      }
    }
    fetchProjects()
  }, [])

  if (status === 'loading') {
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
        return <AdminView projects={projects} />
      default:
        return <div>Unknown role</div>
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-2xl font-bold mb-4">Welcome, {session.user.username}</h1>
      <button 
        onClick={() => signOut()} 
        className="bg-red-500 text-black px-4 py-2 rounded mb-4"
      >
        Logout
      </button>
      {renderContent()}
    </div>
  )
}

