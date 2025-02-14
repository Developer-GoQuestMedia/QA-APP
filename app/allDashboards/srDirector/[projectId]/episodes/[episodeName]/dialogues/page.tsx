'use client'

import { useEffect, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import SrDirectorDialogueView from '@/components/SrDirectorDialogueView'
import { Project, Episode } from '@/types/project'
import { Dialogue } from '@/types/dialogue'

// Define response types for better type safety
interface ProjectResponse {
  project: Project & {
    databaseName: string;
    episodes: Episode[];
  };
}

interface DialogueResponse {
  data: Dialogue[];
  status: string;
  timestamp: number;
}

interface PageProps {
  params: {
    projectId: string
    episodeName: string
  }
}

// Loading state component
const LoadingState = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="space-y-4">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      <div className="text-sm text-gray-500">Loading dialogues...</div>
    </div>
  </div>
);

// Error state component
const ErrorState = ({ message }: { message: string }) => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative max-w-md">
      <strong className="font-bold">Error: </strong>
      <span className="block sm:inline">{message}</span>
    </div>
  </div>
);

export default function SrDirectorDialoguePage({ params }: PageProps) {
  const router = useRouter()
  const { data: session, status } = useSession()

  // Session check effect with proper error handling
  useEffect(() => {
    const checkSession = async () => {
      try {
        if (status === 'unauthenticated') {
          await router.push('/login')
        } else if (session?.user?.role !== 'srDirector') {
          await router.push('/unauthorized')
        }
      } catch (error) {
        console.error('Session check error:', error)
      }
    }
    
    checkSession()
  }, [status, session, router])

  // Query for project data with proper error handling and caching
  const { 
    data: projectData, 
    isLoading: isLoadingProject,
    error: projectError
  } = useQuery<ProjectResponse>({
    queryKey: ['project', params.projectId],
    queryFn: async () => {
      try {
        const response = await axios.get(`/api/projects/${params.projectId}`)
        return response.data
      } catch (error) {
        console.error('Error fetching project:', error)
        throw new Error('Failed to fetch project data')
      }
    },
    enabled: !!session && status === 'authenticated',
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    cacheTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    retry: 2
  })

  // Find the current episode with type safety
  const currentEpisode = projectData?.project?.episodes?.find(
    (ep: Episode) => ep.name === params.episodeName
  )

  // Query for dialogues with proper error handling and caching
  const {
    data: dialoguesData,
    isLoading: isLoadingDialogues,
    error: dialoguesError
  } = useQuery<DialogueResponse>({
    queryKey: ['dialogues', params.projectId, params.episodeName],
    queryFn: async () => {
      try {
        const response = await axios.get('/api/dialogues', {
          params: {
            projectId: params.projectId,
            episodeName: params.episodeName,
            databaseName: projectData?.project?.databaseName,
            collectionName: currentEpisode?.collectionName
          }
        })
        return response.data
      } catch (error) {
        console.error('Error fetching dialogues:', error)
        throw new Error('Failed to fetch dialogue data')
      }
    },
    enabled: !!projectData?.project && !!currentEpisode && !!session && status === 'authenticated',
    staleTime: 5 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
    retry: 2
  })

  // Handle loading states
  if (status === 'loading' || isLoadingProject || isLoadingDialogues) {
    return <LoadingState />
  }

  // Handle errors
  if (projectError) {
    return <ErrorState message="Failed to load project data" />
  }

  if (dialoguesError) {
    return <ErrorState message="Failed to load dialogue data" />
  }

  // Handle missing data
  if (!dialoguesData?.data || !projectData?.project || !currentEpisode) {
    return <ErrorState message="Required data is missing" />
  }

  // Render main component with proper type checking
  return (
    <Suspense fallback={<LoadingState />}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <SrDirectorDialogueView
          dialogues={dialoguesData.data}
          projectId={params.projectId}
          project={{
            databaseName: projectData.project.databaseName,
            title: projectData.project.title
          }}
          episode={{
            collectionName: currentEpisode.collectionName,
            name: currentEpisode.name
          }}
        />
      </div>
    </Suspense>
  )
} 