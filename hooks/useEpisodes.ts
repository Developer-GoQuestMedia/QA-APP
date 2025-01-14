import { useQuery } from '@tanstack/react-query'
import { type Episode } from '@/types/project'
import axios from 'axios'

async function fetchEpisodes(projectId: string): Promise<Episode[]> {
  try {
    const { data } = await axios.get(`/api/episodes?projectId=${projectId}`);
    return data.data || [];
  } catch (error) {
    console.error('Fetch episodes error:', error);
    throw error;
  }
}

export function useEpisodes(projectId: string) {
  return useQuery({
    queryKey: ['episodes', projectId],
    queryFn: () => fetchEpisodes(projectId),
    enabled: !!projectId,
  })
} 