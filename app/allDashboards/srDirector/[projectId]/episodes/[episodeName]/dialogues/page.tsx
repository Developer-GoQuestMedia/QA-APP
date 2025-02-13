'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import SrDirectorDialogueView from '@/components/SrDirectorDialogueView'

interface PageProps {
  params: {
    projectId: string
    episodeName: string
  }
}

export default function SrDirectorDialoguePage({ params }: PageProps) {
  const router = useRouter()
  const { data: session, status } = useSession()

  // Log initial params
  console.log('SrDirectorDialoguePage - Initial params:', {
    projectId: params.projectId,
    episodeName: params.episodeName,
    sessionStatus: status,
    userRole: session?.user?.role
  });

  // Session check effect
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session?.user?.role !== 'srDirector') {
      router.push('/unauthorized')
    }
  }, [status, session, router])

  // Query for project data first
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

  // Find the current episode
  const currentEpisode = projectData?.project?.episodes?.find(
    (ep: any) => ep.name === params.episodeName
  );

  // Query for dialogues with project and episode data
  const { data: dialoguesData, isLoading: isLoadingDialogues } = useQuery({
    queryKey: ['dialogues', params.projectId, params.episodeName],
    queryFn: async () => {
      try {
        console.log('Fetching dialogues with params:', {
          projectId: params.projectId,
          episodeName: params.episodeName,
          databaseName: projectData?.project?.databaseName,
          collectionName: currentEpisode?.collectionName
        });

        const response = await axios.get('/api/dialogues', {
          params: {
            projectId: params.projectId,
            episodeName: params.episodeName,
            databaseName: projectData?.project?.databaseName,
            collectionName: currentEpisode?.collectionName
          }
        });

        console.log('Dialogues API Response:', {
          status: response.status,
          statusText: response.statusText,
          data: response.data,
          dialoguesCount: response.data?.data?.length || 0
        });

        return response.data;
      } catch (error) {
        console.error('Error fetching dialogues:', error);
        throw error;
      }
    },
    enabled: !!projectData?.project && !!currentEpisode && !!session && status === 'authenticated'
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
  if (!dialoguesData?.data || !projectData?.project || !currentEpisode) {
    console.error('Data validation failed:', {
      hasDialoguesData: !!dialoguesData?.data,
      hasProjectData: !!projectData?.project,
      hasEpisode: !!currentEpisode
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

  console.log('Rendering SrDirectorDialogueView with:', {
    dialoguesCount: dialoguesData.data.length,
    projectId: params.projectId,
    projectTitle: projectData.project.title,
    episodeName: params.episodeName,
    databaseName: projectData.project.databaseName,
    collectionName: currentEpisode.collectionName
  });

  return (
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
  )
} 