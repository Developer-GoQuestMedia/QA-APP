import { useQuery } from '@tanstack/react-query'
import { type Dialogue } from '@/types/dialogue'
import { type Project } from '@/types/project'
import axios from 'axios'
import { ObjectId } from 'mongodb'

// Maintain a record of logged projectIds
const loggedProjectIds = new Set<string>();

interface FetchDialoguesParams {
  projectId: string;
  episodeName: string;
}

async function fetchDialogues({ projectId, episodeName }: FetchDialoguesParams): Promise<Dialogue[]> {
  // Validate parameters
  if (!projectId || !ObjectId.isValid(projectId)) {
    console.error('Invalid projectId:', projectId);
    throw new Error('Invalid project ID format');
  }

  if (!episodeName) {
    console.error('Missing episodeName');
    throw new Error('Episode name is required');
  }

  // Only log once per projectId per session
  if (!loggedProjectIds.has(projectId)) {
    console.log('=== Dialogue Fetch Debug ===');
    console.log('Parameters:', { projectId, episodeName });
    console.log('Fetching URL:', `/api/dialogues?projectId=${projectId}&episodeName=${encodeURIComponent(episodeName)}`);
    loggedProjectIds.add(projectId);
  }

  try {
    const response = await axios.get(`/api/dialogues?projectId=${projectId}&episodeName=${encodeURIComponent(episodeName)}`);
    
    // Log response status and data shape
    console.log('Response status:', response.status);
    console.log('Response data shape:', {
      hasData: !!response.data,
      dataLength: response.data?.data?.length || 0
    });
    
    if (!response.data?.data) {
      console.warn('No data in response:', response.data);
      return [];
    }
    
    return response.data.data;
  } catch (error) {
    console.error('Fetch error details:', {
      error,
      params: { projectId, episodeName }
    });
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.error || error.message;
      console.error('Axios error:', errorMessage);
      throw new Error(`Failed to fetch dialogues: ${errorMessage}`);
    }
    throw error;
  }
}

export function useDialogues(projectId: string, episodeName: string) {
  return useQuery({
    queryKey: ['dialogues', projectId, episodeName],
    queryFn: () => fetchDialogues({ projectId, episodeName }),
    enabled: Boolean(projectId && episodeName && ObjectId.isValid(projectId)),
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep unused data for 30 minutes
    retry: 1, // Only retry once on failure
    onError: (error) => {
      console.error('useDialogues hook error:', error);
    }
  });
} 