// app/allDashboards/voice-over/[projectId]/episodes/[episodeName]/dialogues/page.tsx
'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import VoiceOverDialogueView from '@/components/VoiceOverDialogueView'
import { Dialogue } from '@/types/dialogue'
import { Project, Episode as ProjectEpisode, ProjectStatus } from '@/types/project'
import axios from 'axios'

// Define a minimal episode type for the API response
interface Episode {
  _id: string
  name: string
  status: 'uploaded' | 'processing' | 'error'
}

interface PageData {
  data: Dialogue[]
  episode: Episode
  project: {
    _id: string
    title: string
    sourceLanguage: string
    targetLanguage: string
    status: ProjectStatus
    databaseName: string
    description: string
    dialogue_collection: any
    assignedTo: { username: string; role: string }[]
    updatedAt: string | Date
    parentFolder: string
    episodes: ProjectEpisode[]
    uploadStatus: {
      totalFiles: number
      completedFiles: number
      currentFile: number
      status: string
    }
  }
}

export default function DialoguesPage() {
  // 1) Grab route params: projectId, episodeName
  const { projectId, episodeName } = useParams<{
    projectId: string
    episodeName: string
  }>()

  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    async function fetchDialogues() {
      try {
        if (!projectId || !episodeName) {
          setError('Missing route parameters')
          setLoading(false)
          return
        }

        setLoading(true)
        setError('')

        // 2) Because we know the "databaseName" + "collectionName" logic 
        //    can come from a minimal fetch or from server. For demonstration, 
        //    let's do a small extra fetch or assume the DB naming is consistent.
        //
        // If your server needs databaseName & collectionName, you can 
        // fetch them from a project detail endpoint, or 
        // if they're guessable from the route, just do something like:
        // let databaseName = 'Aggeliki_' // or do another fetch to get it
        // let collectionName = 'Aggeliki_Ep_01'
        //
        // For example, if your app expects:
        // project.databaseName -> 'Aggeliki_'
        // episode.collectionName -> 'Aggeliki_Ep_01'
        // 
        // For now, let's do a minimal approach:
        
        // 3) Temporarily fetch the project doc from /api/projects or 
        //    store minimal data in route. We'll do a direct call for demonstration:
        const projectResp = await axios.get('/api/projects', {
          params: { projectId } // might be /api/projects?projectId=...
        })
        const projectDoc = projectResp.data
        if (!projectDoc) {
          setError('Project not found or unauthorized')
          setLoading(false)
          return
        }

        // 4) Find the episode in that project that matches "episodeName"
        const foundEpisode = projectDoc.episodes.find(
          (ep: ProjectEpisode) => ep.name === episodeName
        )
        if (!foundEpisode) {
          setError('Episode not found')
          setLoading(false)
          return
        }

        // 5) Now call /api/dialogues with the real databaseName & collectionName
        const dialoguesResp = await axios.get('/api/dialogues', {
          params: {
            databaseName: projectDoc.databaseName,
            collectionName: foundEpisode.collectionName
          }
        })

        if (!dialoguesResp.data) {
          setError('No dialogues found')
          setLoading(false)
          return
        }

        // Ensure the data matches the expected types
        const responseData = dialoguesResp.data
        setData({
          data: responseData.data,
          episode: {
            _id: responseData.episode._id,
            name: responseData.episode.name,
            status: responseData.episode.status as 'uploaded' | 'processing' | 'error'
          },
          project: {
            ...projectDoc,
            _id: projectDoc._id.toString(),
            status: projectDoc.status as ProjectStatus
          }
        })
      } catch (err: unknown) {
        console.error('Error fetching dialogues page data:', err)
        setError('Failed to load dialogues')
      } finally {
        setLoading(false)
      }
    }

    fetchDialogues()
  }, [projectId, episodeName])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-red-500">
        {error}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-400">
        No data loaded.
      </div>
    )
  }

  // Pass the correctly typed data to VoiceOverDialogueView
  return (
    <VoiceOverDialogueView
      dialogues={data.data}
      projectId={data.project._id}
      episode={data.episode}
      project={data.project}
    />
  )
}
