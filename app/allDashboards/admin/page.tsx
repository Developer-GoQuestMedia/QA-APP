'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import AdminView from '@/components/Admin/view/AdminView'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useRouter } from 'next/navigation'
import { Project } from '@/types/project'

export default function AdminDashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { data: session, status } = useSession()
  const router = useRouter()

  // Memoize user info to prevent unnecessary re-renders
  const userInfo = useMemo(() => ({
    role: session?.user?.role as string | undefined,
    userId: session?.user?.id as string | undefined
  }), [session?.user?.role, session?.user?.id])

  // Fetch projects only when session is authenticated and user info is available
  const fetchProjects = useCallback(async () => {
    if (!userInfo.userId || !userInfo.role) return

    console.log('Admin dashboard: Fetching projects...', {
      timestamp: new Date().toISOString(),
      userId: userInfo.userId,
      userRole: userInfo.role
    })

    try {
      const response = await fetch('/api/projects')
      const data = await response.json()

      console.log('Admin dashboard: Projects fetched successfully:', {
        timestamp: new Date().toISOString(),
        projectCount: data.length,
        projectIds: data.map((p: Project) => p._id),
        userRole: userInfo.role
      })

      setProjects(data)
    } catch (error) {
      console.error('Admin dashboard: Error fetching projects:', {
        timestamp: new Date().toISOString(),
        error,
        userRole: userInfo.role
      })
    } finally {
      setIsLoading(false)
    }
  }, [userInfo.userId, userInfo.role])

  // Handle authentication and role check
  useEffect(() => {
    console.log('Admin dashboard: Component mounted', {
      timestamp: new Date().toISOString(),
      sessionStatus: status,
      userRole: userInfo.role,
      userId: userInfo.userId
    })

    if (status === 'unauthenticated') {
      router.replace('/login')
      return
    }

    if (status === 'authenticated') {
      if (userInfo.role !== 'admin') {
        console.error('Admin dashboard: Unauthorized access attempt', {
          timestamp: new Date().toISOString(),
          userRole: userInfo.role
        })
        router.replace('/unauthorized')
        return
      }
      fetchProjects()
    }
  }, [status, userInfo.role, router, fetchProjects])

  // Show loading state
  if (status === 'loading' || !userInfo.role) {
    console.log('Admin dashboard: Loading state', {
      timestamp: new Date().toISOString(),
      sessionStatus: status
    })
    return <LoadingSpinner />
  }

  // Show dashboard
  console.log('Admin dashboard: Rendering dashboard', {
    timestamp: new Date().toISOString(),
    projectCount: projects.length,
    userRole: userInfo.role,
    userId: userInfo.userId
  })

  return (
    <div className="container mx-auto px-4">
      <AdminView 
        projects={projects} 
        refetchProjects={fetchProjects}
      />
    </div>
  )
}
