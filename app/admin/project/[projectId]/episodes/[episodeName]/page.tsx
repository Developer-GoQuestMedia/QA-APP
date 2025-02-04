// File: app/admin/project/[projectId]/episode/[episodeName]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import axios from 'axios';
import AdminEpisodeView from '@/components/AdminEpisodeView';
import { Episode } from '@/types/project';

export default function EpisodeDetailsPage() {
  const router = useRouter();
  const { projectId, episodeName } = useParams() || {};
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId || !episodeName) return;

    async function fetchEpisode() {
      try {
        // Adjust your API path to how your backend is structured.
        // This example assumes an endpoint like: /api/projects/:projectId/episodes/:episodeName
        const res = await axios.get(
          `/api/projects/${projectId}/episodes/${episodeName}`
        );

        setEpisode(res.data?.episode);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to fetch episode');
      }
    }

    fetchEpisode();
  }, [projectId, episodeName]);

  // If needed, handle "go back" or other routing:
  const goBack = () => router.push(`/admin/project/${projectId}`);

  return (
    <div className="max-w-7xl mx-auto p-4">
      <button
        onClick={goBack}
        className="mb-4 px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded"
      >
        &larr; Back to Project
      </button>

      {error && (
        <div className="bg-red-100 text-red-700 px-4 py-2 mb-4 rounded">
          {error}
        </div>
      )}

      {episode ? (
        <AdminEpisodeView episode={episode} />
      ) : (
        !error && <p>Loading Episode...</p>
      )}
    </div>
  );
}
