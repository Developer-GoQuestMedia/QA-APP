import { useQuery } from '@tanstack/react-query'
import { type Project } from '@/types/project'
import axios from 'axios'

async function fetchProject(projectId: string): Promise<Project> {
  console.log('=== Project Fetch Debug ===');
  console.log('Fetching project ID:', projectId);
  
  const url = `/api/projects/${projectId}`;
  console.log('Fetching URL:', url);

  try {
    const { data } = await axios.get(url);
    console.log('Project data:', data);
    console.log('=== End Debug ===');
    return data;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

export function useProject(projectId: string) {
  console.log('useProject hook called with projectId:', projectId);
  
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => fetchProject(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep unused data for 30 minutes
  });
} 