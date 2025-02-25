'use client';

import { getProject } from '@/lib/projects';
import { getEpisode } from '@/lib/episodes';
import AdminVoiceAssignmentView from '@/components/Admin/AdminVoiceAssignmentView';
import { notFound } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/auth.config';
import { useEffect, useState } from 'react';
import { use } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

interface PageProps {
  params: Promise<{
    projectId: string;
    episodeName: string;
  }>;
}

export default function VoiceAssignmentPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<any>(null);
  const [episode, setEpisode] = useState<any>(null);
  const [dialogues, setDialogues] = useState<any[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch project data
        const projectResponse = await axios.get(`/api/admin/projects/${resolvedParams.projectId}`);
        const projectData = projectResponse.data?.data;
        
        if (!projectData) {
          throw new Error('Project not found');
        }

        // Find episode
        const episodeData = projectData.episodes?.find(
          (ep: any) => ep.name === resolvedParams.episodeName
        );

        if (!episodeData) {
          throw new Error('Episode not found');
        }

        // Fetch dialogues
        const dialoguesResponse = await axios.get('/api/dialogues', {
          params: {
            projectId: resolvedParams.projectId,
            episodeName: resolvedParams.episodeName,
            databaseName: projectData.databaseName,
            collectionName: episodeData.collectionName
          }
        });

        setProject(projectData);
        setEpisode(episodeData);
        setDialogues(dialoguesResponse.data.data || []);
      } catch (error: any) {
        console.error('Error loading voice assignment data:', error);
        setError(error.message || 'Failed to load data');
        toast.error('Failed to load voice assignment data');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [resolvedParams.projectId, resolvedParams.episodeName]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (error || !project || !episode) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        {error || 'Failed to load data'}
      </div>
    );
  }

  return (
    <div className="h-screen">
      <AdminVoiceAssignmentView 
        project={project}
        episode={episode}
        dialogues={dialogues}
      />
    </div>
  );
} 