// File: app/admin/project/[projectId]/episodes/[episodeName]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import axios from 'axios';
import AdminEpisodeView from '@/components/Admin/AdminEpisodeView';
import { Episode } from '@/types/project';
import { toast } from 'react-toastify';

export default function EpisodeDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId as string;
  const episodeName = params?.episodeName as string;
  
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId || !episodeName) {
      setError('Missing project ID or episode name');
      setIsLoading(false);
      return;
    }

    async function fetchEpisode() {
      try {
        setIsLoading(true);
        setError('');
        
        console.log('Fetching episode:', {
          projectId,
          episodeName,
          timestamp: new Date().toISOString()
        });

        const res = await axios.get(`/api/projects/${projectId}/episodes/${encodeURIComponent(episodeName)}`);
        
        if (!res.data?.episode) {
          throw new Error('Invalid episode data received');
        }

        setEpisode(res.data.episode);
        console.log('Episode data loaded:', {
          episodeId: res.data.episode._id,
          name: res.data.episode.name,
          status: res.data.episode.status,
          timestamp: new Date().toISOString()
        });
      } catch (err: any) {
        const errorMessage = err?.response?.data?.error || err.message || 'Failed to fetch episode';
        console.error('Error fetching episode:', {
          error: errorMessage,
          projectId,
          episodeName,
          timestamp: new Date().toISOString()
        });
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    }

    fetchEpisode();
  }, [projectId, episodeName]);

  const goBack = () => {
    router.push(`/allDashboards/admin`);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            onClick={goBack}
            className="mb-6 inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            ← Back to Project
          </button>
          
          <div className="bg-red-50 dark:bg-red-900/50 border-l-4 border-red-400 dark:border-red-500 p-4 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400 dark:text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                  Error Loading Episode
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
          <button
            onClick={goBack}
            className="mb-6 inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            ← Back to Project
          </button>
          
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            <span className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-200">
              Loading episode...
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={goBack}
          className="mb-6 inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          ← Back to Project
        </button>

        {episode && <AdminEpisodeView episodeData={episode} />}
      </div>
    </div>
  );
}
