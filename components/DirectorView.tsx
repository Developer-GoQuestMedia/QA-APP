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
  comments?: string
}

export default function DirectorView({ projects }: { projects: Project[] }) {
  const { data: session } = useSession()
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [dialogues, setDialogues] = useState<Dialogue[]>([])
  const [currentDialogue, setCurrentDialogue] = useState<Dialogue | null>(null)
  const [comments, setComments] = useState('')

  // Filter projects assigned to current user as director
  const assignedProjects = projects.filter(project => 
    project.assignedTo.some(assignment => 
      assignment.username === session?.user?.username && 
      assignment.role === 'director'
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
      setComments(currentDialogue.comments || '')
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
            comments,
            status: 'reviewed'
          }
        })
      })

      if (response.ok) {
        const updatedDialogues = dialogues.map(d => {
          if (d._id === currentDialogue._id) {
            return {
              ...d,
              comments,
              status: 'reviewed'
            }
          }
          return d
        })
        setDialogues(updatedDialogues)
      }
    } catch (error) {
      console.error('Error saving review:', error)
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'transcribed':
        return 'bg-blue-100 text-blue-800'
      case 'translated':
        return 'bg-green-100 text-green-800'
      case 'adapted':
        return 'bg-purple-100 text-purple-800'
      case 'reviewed':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (assignedProjects.length === 0) {
    return <div className="text-center p-4">No projects assigned to you as a director.</div>
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

      {/* Review Interface */}
      {currentDialogue ? (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="space-y-4">
            {/* Status Badge */}
            <div className="flex justify-end">
              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(currentDialogue.status)}`}>
                {currentDialogue.status}
              </span>
            </div>

            {/* Character */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Character
              </label>
              <div className="mt-1 p-3 bg-gray-50 rounded-md">
                {currentDialogue.character}
              </div>
            </div>

            {/* All Versions */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Original Text
                </label>
                <div className="mt-1 p-3 bg-gray-50 rounded-md">
                  {currentDialogue.dialogue.original}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Translation
                </label>
                <div className="mt-1 p-3 bg-gray-50 rounded-md">
                  {currentDialogue.dialogue.translated}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Adaptation
                </label>
                <div className="mt-1 p-3 bg-gray-50 rounded-md">
                  {currentDialogue.dialogue.adapted}
                </div>
              </div>
            </div>

            {/* Comments Input */}
            <div>
              <label htmlFor="comments" className="block text-sm font-medium text-gray-700">
                Director Comments
              </label>
              <textarea
                id="comments"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={4}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                placeholder="Add your review comments..."
              />
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
            >
              Save Review
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

