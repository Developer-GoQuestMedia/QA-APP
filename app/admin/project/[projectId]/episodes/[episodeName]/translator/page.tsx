'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import axios from 'axios';
import AdminTranslatorView from '@/components/Admin/view/AdminTranslatorView';
import { Project, Episode } from '@/types/project';
import { toast } from 'react-toastify';

export default function TranslatorPage() {
  const params = useParams();
  const projectId = params?.projectId as string;
  const episodeName = params?.episodeName as string;
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [project, setProject] = useState<Project | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [dialogues, setDialogues] = useState<any[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        setIsLoading(true);
        setError('');

        // First fetch project data
        const projectResponse = await axios.get(`/api/admin/projects/${projectId}`);
        const episode = projectResponse.data?.data?.episodes?.find(
          (ep: any) => ep.name === episodeName
        );
        const episodeCollectionName = episode?.collectionName;
        const databaseName1 = projectResponse.data?.data?.databaseName;
        

        // Log request parameters
        console.log('Dialogue API Request:', {
          projectId,
          episodeName,
          databaseName: databaseName1,
          url: '/api/dialogues'
        });

        // Fetch dialogues
        const response = await axios.get('/api/dialogues', {
          params: {
            projectId,
            episodeName,
            databaseName: databaseName1,
            collectionName: episodeCollectionName,
            includeProject: true,
            includeEpisode: true
          }
        });

        // Log complete response data
        console.log('Dialogue API Response:', {
          status: response.status,
          dialoguesCount: response.data?.data?.length,
          firstDialogue: response.data?.data?.[0],
          project: {
            id: response.data?.project?._id,
            title: response.data?.project?.title,
            databaseName: response.data?.project?.databaseName
          },
          episode: {
            id: response.data?.episode?._id,
            name: response.data?.episode?.name
          }
        });

        if (response.data) {
          setProject(response.data.project);
          setEpisode(response.data.episode);
          setDialogues(response.data.data || []);
        }

      } catch (error) {
        console.error('Dialogue API Error:', {
          error,
          message: error instanceof Error ? error.message : 'Unknown error',
          requestContext: {
            projectId,
            episodeName
          }
        });
        setError('Failed to fetch dialogue data');
        toast.error('Failed to fetch dialogue data');
      } finally {
        setIsLoading(false);
      }
    }

    if (projectId && episodeName) {
      fetchData();
    }
  }, [projectId, episodeName]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 dark:bg-red-900/50 border-l-4 border-red-400 dark:border-red-500 p-4 rounded-md">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                  Error Loading Data
                </h3>
                <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                  {error}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            <span className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-200">
              Loading data...
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      
        {project && episode && (
          <AdminTranslatorView 
            project={project}
            episode={episode}
            dialogues={dialogues}
          />
        )}
    </div>
  );
} 