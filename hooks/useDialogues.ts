import { useQuery } from '@tanstack/react-query'
import { type Dialogue } from '@/types/dialogue'

async function fetchDialogues(projectId: string): Promise<Dialogue[]> {
  console.log('Fetching dialogues for project:', projectId)
  const res = await fetch(`/api/dialogues?projectId=${projectId}`)
  if (!res.ok) {
    throw new Error('Failed to fetch dialogues')
  }
  const response = await res.json()
  console.log('Dialogues fetched:', response)
  return response.data || []
}

export function useDialogues(projectId: string | undefined) {
  return useQuery({
    queryKey: ['dialogues', projectId],
    queryFn: () => fetchDialogues(projectId!),
    enabled: !!projectId, // Only fetch when projectId is available
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep unused data for 30 minutes
  })
} 