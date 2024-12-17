import { useQuery } from '@tanstack/react-query'
import { type Dialogue } from '@/types/dialogue'
import { type Project } from '@/types/project'

// Maintain a record of logged projectIds
const loggedProjectIds = new Set<string>();

async function fetchDialogues(projectId: string): Promise<Dialogue[]> {
  // Only log once per projectId per session
  if (!loggedProjectIds.has(projectId)) {
    console.log('=== Dialogue Fetch Debug ===');
    console.log('Project ID:', projectId);
    console.log('Fetching URL:', `/api/dialogues?projectId=${projectId}`);
    loggedProjectIds.add(projectId);
  }

  try {
    const res = await fetch(`/api/dialogues?projectId=${projectId}`);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Fetch error:', errorText);
      throw new Error(`Failed to fetch dialogues: ${errorText}`);
    }

    const response = await res.json();
    
    // Only log response data once per projectId
    if (loggedProjectIds.size === 1) {
      console.log('Response data:', response);
      console.log('=== End Debug ===');
    }
    
    return response.data || [];
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

export function useDialogues(projectId: string) {
  return useQuery({
    queryKey: ['dialogues', projectId],
    queryFn: () => fetchDialogues(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep unused data for 30 minutes
  });
} 