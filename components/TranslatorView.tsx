'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

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

interface Dialogue {
  _id: string
  index: number
  timeStart: string
  timeEnd: string
  character: string
  dialogue: {
    original: string
    translated: string
    adapted: string
  }
  status: string
}

const TranslatorView = ({ projects }: { projects: Project[] }) => {
  const { data: session } = useSession()
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [dialogues, setDialogues] = useState<Dialogue[]>([])
  const [currentDialogue, setCurrentDialogue] = useState<Dialogue | null>(null)
  const [translatedText, setTranslatedText] = useState('')

  // Filter projects assigned to current user as translator
  const assignedProjects = projects.filter(project => 
    project.assignedTo.some(assignment => 
      assignment.username === session?.user?.username && 
      assignment.role === 'translator'
    )
  )

  useEffect(() => {
    if (assignedProjects.length > 0 && !selectedProject) {
      setSelectedProject(assignedProjects[0])
    }
  }, [assignedProjects, selectedProject])

  useEffect(() => {
    if (selectedProject) {
      fetchDialogues(selectedProject._id)
    }
  }, [selectedProject])

  useEffect(() => {
    if (currentDialogue) {
      setTranslatedText(currentDialogue.dialogue.translated || '')
    }
  }, [currentDialogue])

  const fetchDialogues = async (projectId: string) => {
    try {
      const res = await fetch(`/api/dialogues?projectId=${projectId}`)
      const response = await res.json()
      if (response.success) {
        setDialogues(response.data)
        if (response.data.length > 0) setCurrentDialogue(response.data[0])
      } else {
        console.error('Failed to fetch dialogues:', response.error)
      }
    } catch (error) {
      console.error('Error fetching dialogues:', error)
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
            'dialogue.translated': translatedText,
            status: 'translated'
          }
        })
      })

      if (response.ok) {
        const updatedDialogues = dialogues.map(d => {
          if (d._id === currentDialogue._id) {
            return {
              ...d,
              dialogue: { ...d.dialogue, translated: translatedText },
              status: 'translated'
            }
          }
          return d
        })
        setDialogues(updatedDialogues)
      }
    } catch (error) {
      console.error('Error saving translation:', error)
    }
  }

  const handleNext = () => {
    if (!currentDialogue || !dialogues.length) return
    const currentIndex = dialogues.findIndex(d => d._id === currentDialogue._id)
    if (currentIndex < dialogues.length - 1) {
      setCurrentDialogue(dialogues[currentIndex + 1])
    }
  }

  const handlePrevious = () => {
    if (!currentDialogue || !dialogues.length) return
    const currentIndex = dialogues.findIndex(d => d._id === currentDialogue._id)
    if (currentIndex > 0) {
      setCurrentDialogue(dialogues[currentIndex - 1])
    }
  }

  if (assignedProjects.length === 0) {
    return <div className="text-center p-4">No projects assigned to you as a translator.</div>
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Project Selector */}
      <div className="mb-6">
        <label htmlFor="project" className="block text-sm font-medium text-gray-700 mb-2">
          Select Project
        </label>
        <select
          id="project"
          value={selectedProject?._id || ''}
          onChange={(e) => {
            const project = assignedProjects.find(p => p._id === e.target.value)
            setSelectedProject(project || null)
          }}
          className="w-full border border-gray-300 rounded-md shadow-sm p-2"
        >
          {assignedProjects.map((project) => (
            <option key={project._id} value={project._id}>
              {project.title}
            </option>
          ))}
        </select>

        {selectedProject && (
          <div className="mt-4 bg-gray-50 rounded-md p-4">
            <h3 className="font-medium text-gray-900">{selectedProject.title}</h3>
            <p className="text-gray-600 mt-1">{selectedProject.description}</p>
            <div className="mt-2 text-sm text-gray-500">
              <p>Source Language: {selectedProject.sourceLanguage}</p>
              <p>Target Language: {selectedProject.targetLanguage}</p>
              <p>Status: {selectedProject.status}</p>
            </div>
          </div>
        )}
      </div>

      {/* Translation Interface */}
      {currentDialogue ? (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="space-y-4">
            {/* Original Text */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Original Text ({selectedProject?.sourceLanguage})
              </label>
              <div className="mt-1 p-3 bg-gray-50 rounded-md">
                {currentDialogue.dialogue.original}
              </div>
            </div>

            {/* Translation Input */}
            <div>
              <label htmlFor="translation" className="block text-sm font-medium text-gray-700">
                Translation ({selectedProject?.targetLanguage})
              </label>
              <textarea
                id="translation"
                value={translatedText}
                onChange={(e) => setTranslatedText(e.target.value)}
                rows={4}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              />
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
            >
              Save Translation
            </button>

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-4">
              <button
                onClick={handlePrevious}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors"
                disabled={dialogues.indexOf(currentDialogue) === 0}
              >
                Previous
              </button>
              <button
                onClick={handleNext}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors"
                disabled={dialogues.indexOf(currentDialogue) === dialogues.length - 1}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center p-4">No dialogues available for this project.</div>
      )}
    </div>
  )
}

export default TranslatorView 