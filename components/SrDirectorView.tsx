'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { Dialogue } from '@/types/dialogue'
import SrDirectorDialogueView from './SrDirectorDialogueView'
import { useCacheCleaner } from '@/hooks/useCacheCleaner'

interface SrDirectorViewProps {
  projectId: string
}

export default function SrDirectorView({ projectId }: SrDirectorViewProps) {
  useCacheCleaner();
  
  const [error, setError] = useState<string>('');

  const { data: dialogues, isLoading } = useQuery({
    queryKey: ['dialogues', projectId],
    queryFn: async () => {
      try {
        const { data } = await axios.get(`/api/dialogues/${projectId}`);
        return data;
      } catch (error) {
        console.error('Error fetching dialogues:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch dialogues');
        return [];
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      </div>
    );
  }

  if (!dialogues?.data || dialogues.data.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">No Dialogues Available</h2>
          <p className="text-gray-600 dark:text-gray-400">There are no dialogues to review at this time.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <SrDirectorDialogueView dialogues={dialogues.data} projectId={projectId} />
    </div>
  );
} 