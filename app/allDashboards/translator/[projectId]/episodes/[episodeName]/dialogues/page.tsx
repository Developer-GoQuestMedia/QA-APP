'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import TranslatorDialogueView from '@/components/Translator/TranslatorDialogueView'

interface PageProps {
  params: {
    projectId: string
    episodeName: string
  }
}

export default function TranslatorDialoguePage({ params }: PageProps) {
  const router = useRouter()
  const { data: session, status } = useSession()

  // Log initial params
  console.log('TranslatorDialoguePage - Initial params:', {
    projectId: params.projectId,
    episodeName: params.episodeName,
    sessionStatus: status,
    userRole: session?.user?.role
  });

  // Session check effect
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session?.user?.role !== 'translator') {
      router.push('/unauthorized')
    }
  }, [status, session, router])

  // Query for dialogues and project data
  const { data: dialoguesData, isLoading: isLoadingDialogues } = useQuery({
    queryKey: ['dialogues', params.projectId, params.episodeName],
    queryFn: async () => {
      try {
        console.log('Fetching dialogues with params:', {
          projectId: params.projectId,
          episodeName: params.episodeName
        });

        // First get the project to get database and collection names
        const projectResponse = await axios.get(`/api/projects/${params.projectId}`);
        const project = projectResponse.data.project;
        
        // Find the episode to get its collection name
        const episode = project.episodes.find((ep: any) => ep.name === params.episodeName);
        
        if (!episode) {
          throw new Error('Episode not found');
        }

        console.log('Found project and episode:', {
          projectId: params.projectId,
          projectTitle: project.title,
          databaseName: project.databaseName,
          episodeName: params.episodeName,
          collectionName: episode.collectionName
        });

        // Now fetch dialogues with the correct database and collection names
        const response = await axios.get('/api/dialogues', {
          params: {
            projectId: params.projectId,
            episodeName: params.episodeName,
            databaseName: project.databaseName,
            collectionName: episode.collectionName
          }
        });

        console.log('Dialogues API Response:', {
          status: response.status,
          statusText: response.statusText,
          data: response.data,
          dialoguesCount: response.data?.data?.length || 0,
          firstDialogue: response.data?.data?.[0],
          lastDialogue: response.data?.data?.[response.data?.data?.length - 1]
        });

        return {
          data: response.data.data,
          project: project,
          episode: episode
        };
      } catch (error) {
        console.error('Error fetching dialogues:', {
          error,
          params: {
            projectId: params.projectId,
            episodeName: params.episodeName
          }
        });
        throw error;
      }
    },
    enabled: !!session && status === 'authenticated'
  });

  // Query for project data
  const { data: projectData, isLoading: isLoadingProject } = useQuery({
    queryKey: ['project', params.projectId],
    queryFn: async () => {
      try {
        console.log('Fetching project:', params.projectId);
        const response = await axios.get(`/api/projects/${params.projectId}`);
        console.log('Project API Response:', {
          status: response.status,
          statusText: response.statusText,
          project: response.data?.project,
          episodes: response.data?.project?.episodes?.length || 0
        });
        return response.data;
      } catch (error) {
        console.error('Error fetching project:', error);
        throw error;
      }
    },
    enabled: !!session && status === 'authenticated'
  });

  // Loading state
  if (status === 'loading' || isLoadingDialogues || isLoadingProject) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  // Error state
  if (!dialoguesData?.data) {
    console.error('Data validation failed:', {
      hasDialoguesData: !!dialoguesData?.data,
      dialoguesData
    });
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">Failed to load dialogue data.</span>
        </div>
      </div>
    )
  }

  console.log('Rendering TranslatorDialogueView with:', {
    dialoguesCount: dialoguesData.data.length,
    projectId: params.projectId,
    episodeName: params.episodeName,
    hasProject: !!dialoguesData.project,
    hasEpisode: !!dialoguesData.episode
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <TranslatorDialogueView
        dialogues={dialoguesData.data}
        projectId={params.projectId}
        episodes={dialoguesData.project?.episodes || []}
        currentEpisodeId={dialoguesData.episode?._id}
      />
    </div>
  )
} 