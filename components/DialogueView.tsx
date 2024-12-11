'use client'

import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

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

interface DialogueViewProps {
  dialogues: Dialogue[]
  projectId: string
}

export default function DialogueView({ dialogues, projectId }: DialogueViewProps) {
  const [currentDialogueIndex, setCurrentDialogueIndex] = useState(0)
  const [character, setCharacter] = useState('')
  const [originalText, setOriginalText] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const queryClient = useQueryClient()

  const currentDialogue = dialogues[currentDialogueIndex]

  useEffect(() => {
    if (currentDialogue) {
      setCharacter(currentDialogue.character || '')
      setOriginalText(currentDialogue.dialogue.original || '')
    }
  }, [currentDialogue])

  const handleSave = async () => {
    if (!currentDialogue) return

    try {
      setSaveStatus('saving')
      setErrorMessage('')
      
      const response = await fetch(`/api/dialogues/${currentDialogue._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          character,
          dialogue: {
            ...currentDialogue.dialogue,
            original: originalText,
          },
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update dialogue')
      }

      setSaveStatus('success')
      
      // Invalidate the dialogues query to refresh the data
      queryClient.invalidateQueries(['dialogues', projectId])
      
      // Reset status after 2 seconds
      setTimeout(() => {
        setSaveStatus('idle')
      }, 2000)
    } catch (error) {
      console.error('Error saving dialogue:', error)
      setSaveStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update dialogue')
      
      // Reset error after 5 seconds
      setTimeout(() => {
        setSaveStatus('idle')
        setErrorMessage('')
      }, 5000)
    }
  }

  const handleNext = () => {
    if (currentDialogueIndex < dialogues.length - 1) {
      setCurrentDialogueIndex(prev => prev + 1)
    }
  }

  const handlePrevious = () => {
    if (currentDialogueIndex > 0) {
      setCurrentDialogueIndex(prev => prev - 1)
    }
  }

  const hasChanges = () => {
    if (!currentDialogue) return false
    return (
      character !== currentDialogue.character ||
      originalText !== currentDialogue.dialogue.original
    )
  }

  if (!currentDialogue) {
    return <div className="text-center p-4">No dialogues available.</div>
  }

  return (
    <div className="space-y-6">
      {/* Video Player */}
      <div className="bg-card rounded-lg shadow-lg overflow-hidden">
        <video
          ref={videoRef}
          src={currentDialogue.videoUrl}
          controls
          className="w-full"
        />
      </div>

      {/* Dialogue Information */}
      <div className="bg-card rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Dialogue {currentDialogueIndex + 1} of {dialogues.length}
          </h2>
          <div className="text-sm text-muted-foreground">
            {currentDialogue.timeStart} - {currentDialogue.timeEnd}
          </div>
        </div>

        {/* Character Input */}
        <div className="mb-4">
          <label htmlFor="character" className="block text-sm font-medium mb-1">
            Character
          </label>
          <input
            type="text"
            id="character"
            value={character}
            onChange={(e) => setCharacter(e.target.value)}
            className="w-full p-2 rounded-md border bg-background text-foreground"
          />
        </div>

        {/* Original Text */}
        <div className="mb-4">
          <label htmlFor="originalText" className="block text-sm font-medium mb-1">
            Original
          </label>
          <textarea
            id="originalText"
            value={originalText}
            onChange={(e) => setOriginalText(e.target.value)}
            rows={3}
            className="w-full p-2 rounded-md border bg-background text-foreground"
          />
        </div>

        {/* Save Button */}
        {hasChanges() && (
          <div className="mb-4">
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
              className={`w-full px-4 py-2 rounded transition-colors ${
                saveStatus === 'saving'
                  ? 'bg-gray-400 cursor-not-allowed'
                  : saveStatus === 'success'
                  ? 'bg-green-500 hover:bg-green-600'
                  : saveStatus === 'error'
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-blue-500 hover:bg-blue-600'
              } text-white`}
            >
              {saveStatus === 'saving'
                ? 'Saving...'
                : saveStatus === 'success'
                ? 'Saved!'
                : saveStatus === 'error'
                ? 'Failed to Save'
                : 'Save Changes'}
            </button>
            {errorMessage && (
              <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
            )}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between">
          <button
            onClick={handlePrevious}
            disabled={currentDialogueIndex === 0}
            className="px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            onClick={handleNext}
            disabled={currentDialogueIndex === dialogues.length - 1}
            className="px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
} 