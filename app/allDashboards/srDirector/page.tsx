'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { ChevronRight } from 'lucide-react'

interface Project {
  _id: string
  name: string
  status: string
  episodeCount: number
  completedEpisodes: number
}

export default function SrDirectorDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()

  // Protect the route
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login' as any)
    } else if (session?.user?.role !== 'srDirector') {
      router.replace('/unauthorized' as any)
    }
  }, [session, status, router])

  // Fetch projects
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['srDirectorProjects'],
    queryFn: async () => {
      const { data } = await axios.get('/api/srDirector/projects')
      return data.data || []
    },
    enabled: !!session && session.user.role === 'srDirector'
  })

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!session || session.user.role !== 'srDirector') {
    return null
  }

  const handleProjectClick = (project: Project) => {
    router.push(`/allDashboards/srDirector/${project._id}/episodes` as any)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Projects</h1>
        </div>

        {projects.length === 0 ? (
          <div className="text-center p-12 bg-white dark:bg-gray-800 rounded-lg">
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              No projects assigned to you yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project: Project) => (
              <div
                key={project._id}
                onClick={() => handleProjectClick(project)}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {project.name}
                    </h2>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        project.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : project.status === 'in-progress'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {project.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                    <span>Episodes: {project.episodeCount}</span>
                    <span>Completed: {project.completedEpisodes}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-end text-blue-600 dark:text-blue-400">
                    <span className="text-sm font-medium">View Episodes</span>
                    <ChevronRight className="w-5 h-5 ml-1" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
} 