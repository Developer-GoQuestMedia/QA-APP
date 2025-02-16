'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect, useCallback } from 'react'
import AdminView from '@/components/AdminView'
import DashboardLayout from '@/components/DashboardLayout'
import { Project } from '@/types/project'
import axios from 'axios'

export default function Page() {
  const { data: session, status } = useSession()
  const [projects, setProjects] = useState<Project[]>([])

  // If you want to ensure fetchProjects has stable identity, wrap in useCallback:
  // Otherwise, simple inline definition is okay.
  const fetchProjects = useCallback(async () => {
    try {
      console.log('Admin dashboard: Fetching projects...', {
        timestamp: new Date().toISOString(),
        userId: session?.user?.id,
        userRole: session?.user?.role
      })

      const { data } = await axios.get('/api/admin/projects')
      const projectsWithDates = data.data.map((project: Omit<Project, 'updatedAt' | 'createdAt'> & {
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
  }, [session?.user?.id, session?.user?.role])

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
    // We only run once on authentication check
  }, [status, fetchProjects, session?.user?.role, session?.user?.id])

  // Removed the second effect that was calling `fetchProjects` again:
  // useEffect(() => {
  //   fetchProjects();
  // }, [fetchProjects]);

  if (status === 'loading') {
    console.log('Admin dashboard: Loading state', {
      timestamp: new Date().toISOString(),
      sessionStatus: status
    })
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
          <p className="text-foreground">Loading session...</p>
        </div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    console.log('Admin dashboard: Unauthenticated access attempt', {
      timestamp: new Date().toISOString(),
      pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown'
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
