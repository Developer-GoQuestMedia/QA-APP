import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

interface Project {
  _id: string
  title: string
  description: string
  sourceLanguage: string
  targetLanguage: string
  status: string
  assignedTo: Array<{
    username: string
    role: string
  }>
}

// Track if initial fetch has been logged
let hasLoggedInitialFetch = false;

async function fetchProjects(): Promise<Project[]> {
  if (!hasLoggedInitialFetch) {
    console.log('=== Projects Fetch Debug ===');
    hasLoggedInitialFetch = true;
  }
  
  try {
    const { data } = await axios.get('/api/projects')
    
    if (!hasLoggedInitialFetch) {
      console.log('Projects data:', data);
      console.log('=== End Debug ===');
    }
    
    return data
  } catch (error) {
    console.error('Failed to fetch projects:', error)
    throw error
  }
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep unused data for 30 minutes
  })
} 