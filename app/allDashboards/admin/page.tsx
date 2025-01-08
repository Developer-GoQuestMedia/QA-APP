'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import AdminView from '@/components/AdminView'
import DashboardLayout from '@/components/DashboardLayout'
import { Project } from '@/types/project'
import axios from 'axios'

export default function Page() {
  const { data: session, status } = useSession()
  const [projects, setProjects] = useState<Project[]>([])

  const fetchProjects = async () => {
    try {
      console.log('Admin dashboard: Fetching projects...', {
        timestamp: new Date().toISOString(),
        userId: session?.user?.id,
        userRole: session?.user?.role
      })

      const { data } = await axios.get('/api/projects')
      const projectsWithDates = data.map((project: Omit<Project, 'updatedAt' | 'createdAt'> & {
        updatedAt: string;
        createdAt?: string;
        _id: string;
      }) => ({
        ...project,
        updatedAt: new Date(project.updatedAt),
        createdAt: project.createdAt ? new Date(project.createdAt) : undefined
      }))

      console.log('Admin dashboard: Projects fetched successfully:', {
        timestamp: new Date().toISOString(),
        projectCount: projectsWithDates.length,
        projectIds: projectsWithDates.map((p: { _id: string }) => p._id),
        userRole: session?.user?.role
      })

      setProjects(projectsWithDates)
    } catch (error) {
      console.error('Admin dashboard: Error fetching projects:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        userId: session?.user?.id,
        userRole: session?.user?.role
      })
    }
  }

  useEffect(() => {
    console.log('Admin dashboard: Component mounted', {
      timestamp: new Date().toISOString(),
      sessionStatus: status,
      userRole: session?.user?.role,
      userId: session?.user?.id
    })

    if (status === 'authenticated') {
      fetchProjects()
    }
  }, [status, session])

  if (status === 'loading') {
    console.log('Admin dashboard: Loading state', {
      timestamp: new Date().toISOString(),
      sessionStatus: status
    })
    return <div>Loading...</div>
  }

  if (status === 'unauthenticated') {
    console.log('Admin dashboard: Unauthenticated access attempt', {
      timestamp: new Date().toISOString(),
      pathname: window.location.pathname
    })
    return null
  }

  console.log('Admin dashboard: Rendering dashboard', {
    timestamp: new Date().toISOString(),
    projectCount: projects.length,
    userRole: session?.user?.role,
    userId: session?.user?.id
  })

  return (
    <DashboardLayout title="Admin Dashboard">
      <AdminView projects={projects} refetchProjects={fetchProjects} />
    </DashboardLayout>
  )
} 