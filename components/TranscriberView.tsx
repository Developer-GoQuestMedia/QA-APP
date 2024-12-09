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
  dialogue: {
    original: string
    translated: string
    adapted: string
  }
  status: string
}

export default function TranscriberView({ projects }: { projects: any[] }) {
  const { data: session } = useSession()
  const [currentDialogue, setCurrentDialogue] = useState<Dialogue | null>(null)
  const [dialogues, setDialogues] = useState<Dialogue[]>([])
  const [character, setCharacter] = useState('')
  const [originalText, setOriginalText] = useState('')
  const [showConfirmation, setShowConfirmation] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (projects.length > 0) {
      fetchDialogues(projects[0]._id)
    }
  }, [projects])

  useEffect(() => {
    if (currentDialogue) {
      setCharacter(currentDialogue.character)
      setOriginalText(currentDialogue.dialogue.original)
    }
  }, [currentDialogue])

  const fetchDialogues = async (projectId: string) => {
    const res = await fetch(`/api/dialogues?projectId=${projectId}`)
    const data = await res.json()
    setDialogues(data)
    if (data.length > 0) setCurrentDialogue(data[0])
  }

  const handlers = useSwipeable({
    onSwipedLeft: () => {
      if (hasChanges()) {
        setShowConfirmation(true)
      } else {
        handleSwipe('next')
      }
    },
    onSwipedRight: () => {
      if (hasChanges()) {
        setShowConfirmation(true)
      } else {
        handleSwipe('prev')
      }
    },
    preventDefaultTouchmoveEvent: true,
    trackMouse: true
  })

  const hasChanges = () => {
    if (!currentDialogue) return false
    return character !== currentDialogue.character || originalText !== currentDialogue.dialogue.original
  }

  const handleSwipe = (direction: 'next' | 'prev') => {
    if (!currentDialogue || !dialogues.length) return

    const currentIndex = dialogues.findIndex(d => d._id === currentDialogue._id)
    const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1

    if (newIndex >= 0 && newIndex < dialogues.length) {
      setCurrentDialogue(dialogues[newIndex])
      setShowConfirmation(false)
    }
  }

  const handleSave = async () => {
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
            character,
            'dialogue.original': originalText,
            status: 'transcribed'
          }
        })
      })

      if (response.ok) {
        const updatedDialogues = dialogues.map(d => {
          if (d._id === currentDialogue._id) {
            return {
              ...d,
              character,
              dialogue: { ...d.dialogue, original: originalText },
              status: 'transcribed'
            }
          }
          return d
        })
        setDialogues(updatedDialogues)
        setShowConfirmation(false)
      }
    } catch (error) {
      console.error('Error saving changes:', error)
    }
  }

  if (!currentDialogue) {
    return <div>No dialogues available</div>
  }

  return (
    <div className="max-w-4xl mx-auto p-4" {...handlers}>
      <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
        <video
          ref={videoRef}
          src={currentDialogue.videoUrl}
          controls
          className="w-full mb-4"
        />
        
        <div className="space-y-4">
          <div>
            <label htmlFor="character" className="block text-sm font-medium text-gray-700">
              Character
            </label>
            <input
              type="text"
              id="character"
              value={character}
              onChange={(e) => setCharacter(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            />
          </div>
          
          <div>
            <label htmlFor="originalText" className="block text-sm font-medium text-gray-700">
              Original Text
            </label>
            <textarea
              id="originalText"
              value={originalText}
              onChange={(e) => setOriginalText(e.target.value)}
              rows={3}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            />
          </div>

          {hasChanges() && (
            <button
              onClick={handleSave}
              className="w-full bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors"
            >
              Save Changes
            </button>
          )}
        </div>
      </div>

      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">Unsaved Changes</h3>
            <p>Do you want to save your changes before moving to the next dialogue?</p>
            <div className="flex justify-end space-x-4 mt-4">
              <button
                onClick={() => {
                  setShowConfirmation(false)
                  handleSwipe('next')
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Discard
              </button>
              <button
                onClick={async () => {
                  await handleSave()
                  handleSwipe('next')
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Save & Continue
              </button>
            </div>
          </div>
        </div>
      )}

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

