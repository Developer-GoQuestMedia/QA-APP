import { useQuery } from '@tanstack/react-query'
import { type Episode } from '@/types/project'
import axios from 'axios'
import { ObjectId } from 'mongodb'

async function fetchEpisodes(projectId: string): Promise<Episode[]> {
  // Validate projectId format
  if (!projectId || !ObjectId.isValid(projectId)) {
    throw new Error('Invalid project ID format');
  }

  try {
    const { data } = await axios.get(`/api/episodes?projectId=${projectId}`);
    
    // Add debug logging
    console.log('Episodes API Response:', {
      success: !!data,
      dataLength: data?.data?.length || 0,
      projectId
    });
    
    return data.data || [];
  } catch (error) {
    console.error('Fetch episodes error:', error);
    // Add more context to the error
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to fetch episodes: ${error.response?.data?.error || error.message}`);
    }
    throw error;
  }
}

export function useEpisodes(projectId: string) {
  return useQuery({
    queryKey: ['episodes', projectId],
    queryFn: () => fetchEpisodes(projectId),
    enabled: !!projectId && ObjectId.isValid(projectId),
    retry: 1, // Only retry once on failure
    staleTime: 30000, // Consider data fresh for 30 seconds
  })
} 