import { useQuery } from '@tanstack/react-query'
import { type Project } from '@/types/project'

async function fetchProject(projectId: string): Promise<Project> {
  console.log('=== Project Fetch Debug ===');
  console.log('Fetching project ID:', projectId);
  
  const url = `/api/projects/${projectId}`;
  console.log('Fetching URL:', url);

  try {
    const res = await fetch(url);
    console.log('Response status:', res.status);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Fetch error:', errorText);
      throw new Error(`Failed to fetch project: ${errorText}`);
    }

    const project = await res.json();
    console.log('Project data:', project);
    console.log('=== End Debug ===');
    return project;
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