import { useQuery } from '@tanstack/react-query'
import { type Episode } from '@/types/project'
import axios from 'axios'

// Utility function to validate MongoDB ObjectId format
function isValidObjectId(id: string): boolean {
  const objectIdPattern = /^[0-9a-fA-F]{24}$/;
  return objectIdPattern.test(id);
}

async function fetchEpisodes(projectId: string): Promise<Episode[]> {
  // Validate parameters
  if (!projectId || !isValidObjectId(projectId)) {
    console.error('Invalid projectId:', projectId);
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
    enabled: !!projectId && isValidObjectId(projectId),
    retry: 1, // Only retry once on failure
    staleTime: 30000, // Consider data fresh for 30 seconds
  })
} 