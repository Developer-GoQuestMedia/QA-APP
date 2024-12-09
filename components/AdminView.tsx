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

interface User {
  username: string
  role: string
  assignedProjects: Array<{
    projectId: string
    role: string
  }>
}

export default function AdminView({ projects: initialProjects }: { projects: Project[] }) {
  const { data: session } = useSession()
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [users, setUsers] = useState<User[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [newProject, setNewProject] = useState({
    title: '',
    description: '',
    sourceLanguage: '',
    targetLanguage: '',
    status: 'pending'
  })
  const [assignment, setAssignment] = useState({
    username: '',
    role: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users')
      if (response.ok) {
        const data = await response.json()
        setUsers(data)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newProject),
      })

      if (response.ok) {
        const data = await response.json()
        setProjects([...projects, { ...newProject, _id: data.projectId, assignedTo: [] }])
        setNewProject({
          title: '',
          description: '',
          sourceLanguage: '',
          targetLanguage: '',
          status: 'pending'
        })
      } else {
        setError('Failed to create project')
      }
    } catch (error) {
      setError('Error creating project')
      console.error('Error creating project:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAssignProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProject) return

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/projects/${selectedProject._id}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(assignment),
      })

      if (response.ok) {
        const updatedProjects = projects.map(p => {
          if (p._id === selectedProject._id) {
            return {
              ...p,
              assignedTo: [...p.assignedTo, assignment]
            }
          }
          return p
        })
        setProjects(updatedProjects)
        setAssignment({ username: '', role: '' })
        setSelectedProject(null)
      } else {
        setError('Failed to assign project')
      }
    } catch (error) {
      setError('Error assigning project')
      console.error('Error assigning project:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredUsers = (role: string) => {
    return users.filter(user => 
      user.role === role && 
      (!selectedProject || !selectedProject.assignedTo.some(a => a.username === user.username))
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Project Creation Form */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4">Create New Project</h2>
          <form onSubmit={handleCreateProject} className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                Title
              </label>
              <input
                type="text"
                id="title"
                value={newProject.title}
                onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                required
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea
                id="description"
                value={newProject.description}
                onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                rows={3}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                required
              />
            </div>

            <div>
              <label htmlFor="sourceLanguage" className="block text-sm font-medium text-gray-700">
                Source Language
              </label>
              <input
                type="text"
                id="sourceLanguage"
                value={newProject.sourceLanguage}
                onChange={(e) => setNewProject({ ...newProject, sourceLanguage: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                required
              />
            </div>

            <div>
              <label htmlFor="targetLanguage" className="block text-sm font-medium text-gray-700">
                Target Language
              </label>
              <input
                type="text"
                id="targetLanguage"
                value={newProject.targetLanguage}
                onChange={(e) => setNewProject({ ...newProject, targetLanguage: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors disabled:bg-blue-300"
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </form>
        </div>

        {/* Project Assignment Form */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4">Assign Project</h2>
          <form onSubmit={handleAssignProject} className="space-y-4">
            <div>
              <label htmlFor="project" className="block text-sm font-medium text-gray-700">
                Select Project
              </label>
              <select
                id="project"
                value={selectedProject?._id || ''}
                onChange={(e) => setSelectedProject(projects.find(p => p._id === e.target.value) || null)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                required
              >
                <option value="">Select a project</option>
                {projects.map((project) => (
                  <option key={project._id} value={project._id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                Select Role
              </label>
              <select
                id="role"
                value={assignment.role}
                onChange={(e) => setAssignment({ ...assignment, role: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                required
              >
                <option value="">Select a role</option>
                <option value="transcriber">Transcriber</option>
                <option value="translator">Translator</option>
                <option value="voice-over">Voice-over</option>
                <option value="director">Director</option>
              </select>
            </div>

            {assignment.role && (
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                  Select User
                </label>
                <select
                  id="username"
                  value={assignment.username}
                  onChange={(e) => setAssignment({ ...assignment, username: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  required
                >
                  <option value="">Select a user</option>
                  {filteredUsers(assignment.role).map((user) => (
                    <option key={user.username} value={user.username}>
                      {user.username}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !selectedProject || !assignment.role || !assignment.username}
              className="w-full bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors disabled:bg-green-300"
            >
              {loading ? 'Assigning...' : 'Assign Project'}
            </button>
          </form>
        </div>
      </div>

      {/* Project List */}
      <div className="mt-8">
        <h2 className="text-xl font-bold mb-4">Current Projects</h2>
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assigned To
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {projects.map((project) => (
                <tr key={project._id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{project.title}</div>
                    <div className="text-sm text-gray-500">{project.description}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      {project.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <ul>
                      {project.assignedTo.map((assignment, index) => (
                        <li key={index}>
                          {assignment.username} ({assignment.role})
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}
    </div>
  )
}

