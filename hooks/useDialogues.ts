import { useQuery } from '@tanstack/react-query'
import { type Dialogue } from '@/types/dialogue'
import { type Project } from '@/types/project'

async function fetchDialogues(projectId: string): Promise<Dialogue[]> {
  console.log('=== Dialogue Fetch Debug ===');
  console.log('Project ID:', projectId);
  
  const url = `/api/dialogues?projectId=${projectId}`;
  console.log('Fetching URL:', url);

  try {
    const res = await fetch(url);
    console.log('Response status:', res.status);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Fetch error:', errorText);
      throw new Error(`Failed to fetch dialogues: ${errorText}`);
    }

    const response = await res.json();
    console.log('Response data:', response);
    console.log('=== End Debug ===');
    return response.data || [];
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

export function useDialogues(projectId: string) {
  console.log('useDialogues hook called with projectId:', projectId);
  
  return useQuery({
    queryKey: ['dialogues', projectId],
    queryFn: () => fetchDialogues(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep unused data for 30 minutes
  });
} 