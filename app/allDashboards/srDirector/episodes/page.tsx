'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { ChevronRight } from 'lucide-react'

interface Episode {
  _id: string
  name: string
  status: string
  collectionName: string
}

interface PageProps {
  params: {
    projectId: string
  }
}

export default function SrDirectorEpisodesPage({ params }: PageProps) {
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

  // Fetch episodes
  const { data: episodes = [], isLoading } = useQuery({
    queryKey: ['srDirectorEpisodes', params.projectId],
    queryFn: async () => {
      const { data } = await axios.get(`/api/srDirector/projects/${params.projectId}/episodes`)
      return data.data || []
    },
    enabled: !!session && session.user.role === 'srDirector' && !!params.projectId
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

  const handleEpisodeClick = (episode: Episode) => {
    router.push(`/allDashboards/srDirector/${params.projectId}/episodes/${episode.name}/dialogues` as any)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Episodes</h1>
          <button
            onClick={() => router.back()}
            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Back to Projects
          </button>
        </div>

        {episodes.length === 0 ? (
          <div className="text-center p-12 bg-white dark:bg-gray-800 rounded-lg">
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              No episodes available for this project.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {episodes.map((episode: Episode) => (
              <div
                key={episode._id}
                onClick={() => handleEpisodeClick(episode)}
                className="flex items-center justify-between p-6 bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                <div className="flex items-center space-x-6">
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      episode.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : episode.status === 'in-progress'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {episode.status}
                  </span>
                  <span className="text-gray-900 dark:text-white font-medium text-lg">
                    {episode.name}
                  </span>
                </div>
                <ChevronRight className="w-6 h-6 text-gray-400" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
} 