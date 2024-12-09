'use client'

import { useState, useEffect, useRef } from 'react'
import { useSwipeable } from 'react-swipeable'
import { useSession } from 'next-auth/react'

interface Dialogue {
  _id: string
  index: number
  timeStart: string
  timeEnd: string
  character: string
  videoUrl: string
  audioUrl?: string
  dialogue: {
    original: string
    translated: string
    adapted: string
  }
  status: string
}

export default function DirectorView({ projects }: { projects: any[] }) {
  const { data: session } = useSession()
  const [currentDialogue, setCurrentDialogue] = useState<Dialogue | null>(null)
  const [dialogues, setDialogues] = useState<Dialogue[]>([])
  const [playbackMode, setPlaybackMode] = useState<'video' | 'audio' | 'combined'>('video')
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (projects.length > 0) {
      fetchDialogues(projects[0]._id)
    }
  }, [projects])

  const fetchDialogues = async (projectId: string) => {
    const res = await fetch(`/api/dialogues?projectId=${projectId}`)
    const data = await res.json()
    setDialogues(data)
    if (data.length > 0) setCurrentDialogue(data[0])
  }

  const handlers = useSwipeable({
    onSwipedLeft: () => handleSwipe('next'),
    onSwipedRight: () => handleSwipe('prev'),
    preventDefaultTouchmoveEvent: true,
    trackMouse: true
  })

  const handleSwipe = (direction: 'next' | 'prev') => {
    if (!currentDialogue || !dialogues.length) return

    const currentIndex = dialogues.findIndex(d => d._id === currentDialogue._id)
    const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1

    if (newIndex >= 0 && newIndex < dialogues.length) {
      setCurrentDialogue(dialogues[newIndex])
      if (videoRef.current) videoRef.current.pause()
      if (audioRef.current) audioRef.current.pause()
    }
  }

  const handlePlayCombined = async () => {
    if (!videoRef.current || !audioRef.current || !currentDialogue) return

    // Reset both media elements
    videoRef.current.currentTime = 0
    audioRef.current.currentTime = 0

    // Start playback
    try {
      await Promise.all([
        videoRef.current.play(),
        audioRef.current.play()
      ])
    } catch (error) {
      console.error('Error playing media:', error)
    }
  }

  const handleApprove = async () => {
    if (!currentDialogue) return

    try {
      const response = await fetch('/api/dialogues', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dialogueId: currentDialogue._id,
          updates: {
            status: 'approved'
          }
        })
      })

      if (response.ok) {
        const updatedDialogues = dialogues.map(d => {
          if (d._id === currentDialogue._id) {
            return { ...d, status: 'approved' }
          }
          return d
        })
        setDialogues(updatedDialogues)
      }
    } catch (error) {
      console.error('Error approving dialogue:', error)
    }
  }

  if (!currentDialogue) {
    return <div>No dialogues available</div>
  }

  return (
    <div className="max-w-4xl mx-auto p-4" {...handlers}>
      <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
        <div className="mb-4">
          <div className="flex space-x-4 mb-4">
            <button
              onClick={() => setPlaybackMode('video')}
              className={`px-4 py-2 rounded ${
                playbackMode === 'video'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              Video Only
            </button>
            <button
              onClick={() => setPlaybackMode('audio')}
              className={`px-4 py-2 rounded ${
                playbackMode === 'audio'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
              disabled={!currentDialogue.audioUrl}
            >
              Audio Only
            </button>
            <button
              onClick={() => setPlaybackMode('combined')}
              className={`px-4 py-2 rounded ${
                playbackMode === 'combined'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
              disabled={!currentDialogue.audioUrl}
            >
              Combined
            </button>
          </div>

          {(playbackMode === 'video' || playbackMode === 'combined') && (
            <video
              ref={videoRef}
              src={currentDialogue.videoUrl}
              controls
              className={`w-full ${playbackMode === 'combined' ? 'mb-4' : ''}`}
            />
          )}

          {(playbackMode === 'audio' || playbackMode === 'combined') && currentDialogue.audioUrl && (
            <audio
              ref={audioRef}
              src={currentDialogue.audioUrl}
              controls
              className="w-full"
            />
          )}

          {playbackMode === 'combined' && currentDialogue.audioUrl && (
            <button
              onClick={handlePlayCombined}
              className="mt-4 w-full bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors"
            >
              Play Together
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="font-semibold">Character</h3>
            <p>{currentDialogue.character}</p>
          </div>
          
          <div>
            <h3 className="font-semibold">Original</h3>
            <p>{currentDialogue.dialogue.original}</p>
          </div>
          
          <div>
            <h3 className="font-semibold">Translated</h3>
            <p>{currentDialogue.dialogue.translated}</p>
          </div>
          
          <div>
            <h3 className="font-semibold">Adapted</h3>
            <p>{currentDialogue.dialogue.adapted}</p>
          </div>

          <button
            onClick={handleApprove}
            disabled={currentDialogue.status === 'approved'}
            className={`w-full px-4 py-2 rounded ${
              currentDialogue.status === 'approved'
                ? 'bg-gray-300 text-gray-500'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            } transition-colors`}
          >
            {currentDialogue.status === 'approved' ? 'Approved' : 'Approve'}
          </button>
        </div>
      </div>

      <div className="flex justify-between mt-4">
        <button
          onClick={() => handleSwipe('prev')}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
          disabled={dialogues.indexOf(currentDialogue) === 0}
        >
          Previous
        </button>
        <button
          onClick={() => handleSwipe('next')}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
          disabled={dialogues.indexOf(currentDialogue) === dialogues.length - 1}
        >
          Next
        </button>
      </div>
    </div>
  )
}

