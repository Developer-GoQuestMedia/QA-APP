'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { ChevronRight, Search } from 'lucide-react'

interface Dialogue {
  _id: string
  dialogueNumber: number
  characterName: string
  dialogueText: string
  status: string
  assignedTo?: string
}

interface PageProps {
  params: {
    projectId: string
    episodeName: string
  }
}

export default function SrDirectorDialoguesPage({ params }: PageProps) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')

  // Protect the route
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login' as any)
    } else if (session?.user?.role !== 'srDirector') {
      router.replace('/unauthorized' as any)
    }
  }, [session, status, router])

  // Fetch dialogues
  const { data: dialogues = [], isLoading } = useQuery({
    queryKey: ['srDirectorDialogues', params.projectId, params.episodeName],
    queryFn: async () => {
      const { data } = await axios.get(
        `/api/srDirector/projects/${params.projectId}/episodes/${params.episodeName}/dialogues`
      )
      return data.data || []
    },
    enabled: !!session && session.user.role === 'srDirector' && !!params.projectId && !!params.episodeName
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

  const filteredDialogues = dialogues.filter((dialogue: Dialogue) => {
    const searchString = searchTerm.toLowerCase()
    return (
      dialogue.dialogueNumber.toString().includes(searchString) ||
      dialogue.characterName.toLowerCase().includes(searchString) ||
      dialogue.dialogueText.toLowerCase().includes(searchString) ||
      dialogue.status.toLowerCase().includes(searchString)
    )
  })

  const handleDialogueClick = (dialogue: Dialogue) => {
    router.push(
      `/allDashboards/srDirector/${params.projectId}/episodes/${params.episodeName}/dialogues/${dialogue.dialogueNumber}` as any
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dialogues</h1>
          <button
            onClick={() => router.back()}
            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Back to Episodes
          </button>
        </div>

        <div className="mb-6 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search dialogues..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white dark:bg-gray-800 dark:border-gray-700 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>

        {filteredDialogues.length === 0 ? (
          <div className="text-center p-12 bg-white dark:bg-gray-800 rounded-lg">
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              No dialogues found matching your search.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredDialogues.map((dialogue: Dialogue) => (
              <div
                key={dialogue._id}
                onClick={() => handleDialogueClick(dialogue)}
                className="flex items-center justify-between p-6 bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-4 mb-2">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      #{dialogue.dialogueNumber}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {dialogue.characterName}
                    </span>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        dialogue.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : dialogue.status === 'in-progress'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {dialogue.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                    {dialogue.dialogueText}
                  </p>
                </div>
                <ChevronRight className="w-6 h-6 text-gray-400 ml-4 flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
} 