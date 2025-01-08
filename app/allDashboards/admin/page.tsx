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
      console.log('Fetching projects...');
      const { data } = await axios.get('/api/projects')
      const projectsWithDates = data.map((project: Omit<Project, 'updatedAt' | 'createdAt'> & {
        updatedAt: string;
        createdAt?: string;
      }) => ({
        ...project,
        updatedAt: new Date(project.updatedAt),
        createdAt: project.createdAt ? new Date(project.createdAt) : undefined
      }))
      console.log('Projects fetched successfully:', projectsWithDates.length);
      setProjects(projectsWithDates)
    } catch (error) {
      console.error('Error fetching projects:', error)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  if (status === 'loading') {
    return <div>Loading...</div>
  }

  return (
    <DashboardLayout title="Admin Dashboard">
      <AdminView projects={projects} refetchProjects={fetchProjects} />
    </DashboardLayout>
  )
} 