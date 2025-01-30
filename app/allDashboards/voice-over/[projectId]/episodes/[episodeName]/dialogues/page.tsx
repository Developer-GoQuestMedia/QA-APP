'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import VoiceOverDialogueView from '@/components/VoiceOverDialogueView'
import { Dialogue } from '@/types/dialogue'
import { Project } from '@/types/project'

interface Episode {
  _id: string
  name: string
  status: string
}

interface PageData {
  dialogues: Dialogue[]
  episode: Episode
  project: Project
}

export default function DialoguesPage() {
  const searchParams = useSearchParams()
  const [pageData, setPageData] = useState<PageData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      // Parse URL parameters
      const dialoguesParam = searchParams.get('dialogues')
      const episodeParam = searchParams.get('episode')
      const projectParam = searchParams.get('project')

      if (!dialoguesParam || !episodeParam || !projectParam) {
        throw new Error('Missing required data in URL parameters')
      }

      // Parse the JSON data
      const dialogues = JSON.parse(dialoguesParam)
      const episode = JSON.parse(episodeParam)
      const project = JSON.parse(projectParam)

      console.log('Parsed page data:', {
        dialoguesCount: dialogues.length,
        episodeName: episode.name,
        projectTitle: project.title
      })

      setPageData({
        dialogues,
        episode,
        project
      })
    } catch (error) {
      console.error('Error parsing URL parameters:', error)
      setError('Failed to load dialogue data')
    }
  }, [searchParams])

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-red-500 text-white px-4 py-2 rounded shadow-lg">
          {error}
        </div>
      </div>
    )
  }

  if (!pageData) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    )
  }

  return (
    <VoiceOverDialogueView 
      dialogues={pageData.dialogues}
      projectId={typeof pageData.project._id === 'string' ? pageData.project._id : pageData.project._id.toString()}
      episode={pageData.episode}
      project={pageData.project}
    />
  )
} 