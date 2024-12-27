'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

interface ProjectProgress {
  transcribed: number
  translated: number
  voiceOver: number
  approved: number
  total: number
  lastUpdated: string
}

export default function ProjectProgressPage({
  params,
}: {
  params: { projectId: string }
}) {
  const { data: session, status } = useSession()
  const router = useRouter()

  const { data: progress, isLoading } = useQuery<ProjectProgress>({
    queryKey: ['project-progress', params.projectId],
    queryFn: async () => {
      const response = await axios.get(`/api/admin/projects/${params.projectId}/progress`)
      return response.data.data
    },
    enabled: !!session && session.user.role === 'admin'
  })

  useEffect(() => {
    if (status === 'unauthenticated' || (session && session.user.role !== 'admin')) {
      router.push('/login')
    }
  }, [status, session, router])

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2">Loading...</p>
        </div>
      </div>
    )
  }

  if (!progress) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-blue-500 hover:text-blue-600 transition-colors"
          >
            ← Back
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Project Progress</h1>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="bg-blue-50 dark:bg-blue-900/50 rounded-lg p-4">
              <h3 className="text-blue-800 dark:text-blue-200 font-medium">Transcribed</h3>
              <div className="mt-2">
                <div className="flex items-center">
                  <div className="flex-1 bg-blue-200 dark:bg-blue-700 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${progress.transcribed}%` }}
                    />
                  </div>
                  <span className="ml-2 text-blue-800 dark:text-blue-200">
                    {progress.transcribed}%
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-purple-50 dark:bg-purple-900/50 rounded-lg p-4">
              <h3 className="text-purple-800 dark:text-purple-200 font-medium">Translated</h3>
              <div className="mt-2">
                <div className="flex items-center">
                  <div className="flex-1 bg-purple-200 dark:bg-purple-700 rounded-full h-2">
                    <div
                      className="bg-purple-500 h-2 rounded-full"
                      style={{ width: `${progress.translated}%` }}
                    />
                  </div>
                  <span className="ml-2 text-purple-800 dark:text-purple-200">
                    {progress.translated}%
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-green-50 dark:bg-green-900/50 rounded-lg p-4">
              <h3 className="text-green-800 dark:text-green-200 font-medium">Voice Over</h3>
              <div className="mt-2">
                <div className="flex items-center">
                  <div className="flex-1 bg-green-200 dark:bg-green-700 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${progress.voiceOver}%` }}
                    />
                  </div>
                  <span className="ml-2 text-green-800 dark:text-green-200">
                    {progress.voiceOver}%
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/50 rounded-lg p-4">
              <h3 className="text-yellow-800 dark:text-yellow-200 font-medium">Approved</h3>
              <div className="mt-2">
                <div className="flex items-center">
                  <div className="flex-1 bg-yellow-200 dark:bg-yellow-700 rounded-full h-2">
                    <div
                      className="bg-yellow-500 h-2 rounded-full"
                      style={{ width: `${progress.approved}%` }}
                    />
                  </div>
                  <span className="ml-2 text-yellow-800 dark:text-yellow-200">
                    {progress.approved}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">
            <p>Total Dialogues: {progress.total}</p>
            <p>Last Updated: {new Date(progress.lastUpdated).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  )
} 