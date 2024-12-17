'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import AdminView from '@/components/AdminView'
import DashboardLayout from '@/components/DashboardLayout'
import { Project } from '@/types/project'
import axios from 'axios'

export default function Page() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session?.user?.role !== 'admin') {
      // Redirect if user is not an admin
      router.push('/login')
    }
  }, [status, session, router])

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const { data } = await axios.get('/api/projects')
        // Transform dates to Date objects
        const projectsWithDates = data.map((project: Omit<Project, 'updatedAt' | 'createdAt'> & {
          updatedAt: string;
          createdAt?: string;
        }) => ({
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

  return (
    <DashboardLayout title="Admin Dashboard">
      <AdminView projects={projects} />
    </DashboardLayout>
  )
} 