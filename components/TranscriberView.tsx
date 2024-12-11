'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

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

export default function TranscriberView({ projects }: { projects: Project[] }) {
  const { data: session } = useSession()
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  // Filter projects assigned to current user as transcriber
  const assignedProjects = projects.filter(project => 
    project.assignedTo.some(assignment => 
      assignment.username === session?.user?.username && 
      assignment.role === 'transcriber'
    )
  )

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true)
      await signOut({ redirect: true, callbackUrl: '/login' })
    } catch (error) {
      console.error('Error logging out:', error)
      setIsLoggingOut(false)
    }
  }

  if (assignedProjects.length === 0) {
    return <div className="text-center p-4">No projects assigned to you as a transcriber.</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Your Projects</h1>
          <button 
            onClick={handleLogout}
            disabled={isLoggingOut}
            className={`px-4 py-2 rounded transition-colors ${
              isLoggingOut 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-red-500 hover:bg-red-600'
            } text-white`}
          >
            {isLoggingOut ? 'Logging out...' : 'Logout'}
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {assignedProjects.map((project) => (
            <div
              key={project._id}
              onClick={() => router.push(`/allDashboards/transcriber/${project._id}`)}
              className="bg-card rounded-lg shadow-lg p-6 cursor-pointer hover:shadow-xl transition-shadow"
            >
              <h2 className="text-xl font-semibold mb-2">{project.title}</h2>
              <p className="text-muted-foreground mb-4">{project.description}</p>
              <div className="text-sm text-muted-foreground">
                <p>Source Language: {project.sourceLanguage}</p>
                <p>Status: {project.status}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

