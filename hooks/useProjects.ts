import { useQuery } from '@tanstack/react-query'

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

async function fetchProjects(): Promise<Project[]> {
  console.log('Fetching projects...')
  const res = await fetch('/api/projects')
  if (!res.ok) {
    throw new Error('Failed to fetch projects')
  }
  const data = await res.json()
  console.log('Projects fetched:', data)
  return data
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep unused data for 30 minutes
  })
} 