'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Project, Episode } from '@/types/project'
import { Search, ChevronRight, Loader2 } from 'lucide-react'
import axios from 'axios'
import type { ObjectId } from 'bson'

// Define AssignedUser type
interface AssignedUser {
  username: string
  role: string
}

interface TranslatorViewProps {
  projects?: Project[] // Make projects optional
}

// Utility function to validate MongoDB ObjectId format
function isValidObjectId(id: string | ObjectId): boolean {
  if (typeof id === 'string') {
    return /^[0-9a-fA-F]{24}$/.test(id)
  }
  return typeof id === 'object' && id !== null && '_bsontype' in id && id._bsontype === 'ObjectId'
}

function getStringId(id: string | ObjectId): string {
  if (typeof id === 'string') {
    return id
  }
  return id.toString()
}

export default function TranslatorView({ projects = [] }: TranslatorViewProps) {
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()
  const [isClient, setIsClient] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [isEpisodesModalOpen, setIsEpisodesModalOpen] = useState(false)
  const [loadingEpisodeId, setLoadingEpisodeId] = useState<string | null>(null)

  // Handle client-side initialization
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Don't render anything until we're sure we're on the client
  if (!isClient || sessionStatus === 'loading') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  console.log('TranslatorView Component:', {
    sessionExists: !!session,
    userRole: session?.user?.role,
    username: session?.user?.username,
    totalProjects: projects.length
  })

  // Filter projects assigned to current user as translator
  const assignedProjects = projects.filter((project) =>
    project.assignedTo?.some?.(
      (assignment: AssignedUser) =>
        assignment.username === session?.user?.username &&
        assignment.role === 'translator'
    ) ?? false
  )

  // Filter by search term
  const filteredProjects = assignedProjects.filter((project) =>
    project.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.description?.toLowerCase().includes(searchTerm.toLowerCase()) || false
  )

  console.log('Filtered projects:', {
    totalAssigned: assignedProjects.length,
    assignedProjectTitles: assignedProjects.map((p) => p.title)
  })

  // Handle user logout
  // const handleLogout = async () => {
  //   try {
  //     setIsLoggingOut(true)
  //     if (typeof window !== 'undefined') {
  //       window.localStorage.clear()
  //     }
  //     await signOut({ redirect: true, callbackUrl: '/login' })
  //   } catch (error) {
  //     console.error('Error during signOut:', error)
  //     router.replace('/login')
  //   } finally {
  //     setIsLoggingOut(false)
  //   }
  // }

  // Show episodes modal for a selected project
  const handleProjectClick = (project: Project) => {
    setSelectedProject(project)
    setIsEpisodesModalOpen(true)
  }

  // Handle fetching dialogues and navigating
  const handleEpisodeClick = async (
    projectId: string,
    episodeName: string,
    episodeId: string,
    project: Project,
    episode: Episode
  ) => {
    try {
      setLoadingEpisodeId(episodeId)

      const response = await axios.get(`/api/dialogues`, {
        params: {
          projectId,
          episodeName,
          databaseName: project.databaseName,
          collectionName: episode.collectionName
        }
      })

      if (response.data) {
        const minimalUrl = `/allDashboards/translator/${projectId}/episodes/${episodeName}/dialogues` as const
        router.push(minimalUrl as any)
      } else {
        console.error('No data returned from API')
      }

    } catch (error) {
      console.error('Error fetching dialogues:', error)
    } finally {
      setLoadingEpisodeId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        
        <div className="flex justify-between items-center center mb-6">
          <h1 className="text-2xl font-bold text-center text-white">Translator Dashboard</h1>
          {/* <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className={`px-4 py-2 rounded transition-colors ${
              isLoggingOut ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600'
            } text-white`}
          >
            {isLoggingOut ? 'Logging out...' : 'Logout'}
          </button> */}
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Projects Grid */}
        {filteredProjects.length === 0 ? (
          <div className="text-center p-8 bg-gray-800 rounded-lg">
            <p className="text-gray-400">No projects assigned to you as a translator.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              <div
                key={getStringId(project._id)}
                className="bg-gray-800 rounded-lg p-6 hover:bg-gray-700 transition-colors cursor-pointer"
                onClick={() => handleProjectClick(project)}
              >
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-semibold text-white">{project.title}</h2>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      project.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : project.status === 'in-progress'
                        ? 'bg-blue-100 text-blue-800'
                        : project.status === 'on-hold'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {project.status}
                  </span>
                </div>
                <p className="text-gray-400 mb-4 line-clamp-2">{project.description}</p>
                <div className="text-sm text-gray-500 space-y-1">
                  <p>Source Language: {project.sourceLanguage}</p>
                  <p>Target Language: {project.targetLanguage}</p>
                  <p>Episodes: {project.episodes?.length || 0}</p>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    className="flex items-center text-blue-400 hover:text-blue-300 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleProjectClick(project)
                    }}
                  >
                    View Episodes
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Episodes Modal */}
      {isEpisodesModalOpen && selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-white">
                Episodes for {selectedProject.title}
              </h2>
              <button
                onClick={() => {
                  setIsEpisodesModalOpen(false)
                  setSelectedProject(null)
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {selectedProject.episodes && selectedProject.episodes.length > 0 ? (
                selectedProject.episodes.map((episode: Episode) => {
                  const projectIdStr = getStringId(selectedProject._id)
                  const episodeIdStr = getStringId(episode._id)
                  const episodeNameStr = episode.name

                  return (
                    <div
                      key={episodeIdStr}
                      onClick={() => {
                        handleEpisodeClick(
                          projectIdStr,
                          episodeNameStr,
                          episodeIdStr,
                          selectedProject,
                          episode
                        )
                      }}
                      className="flex items-center justify-between p-4 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center space-x-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            episode.status === 'uploaded'
                              ? 'bg-green-100 text-green-800'
                              : episode.status === 'processing'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {episode.status}
                        </span>
                        <span className="text-white font-medium">{episodeNameStr}</span>
                      </div>
                      {loadingEpisodeId === episodeIdStr ? (
                        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  )
                })
              ) : (
                <div className="text-center p-4 text-gray-400">
                  No episodes available for this project.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 