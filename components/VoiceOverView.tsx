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

export default function VoiceOverView({ projects }: { projects: Project[] }) {
  const { data: session } = useSession()
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  // Filter projects assigned to current user as voice-over
  const assignedProjects = projects.filter(project => 
    project.assignedTo.some(assignment => 
      assignment.username === session?.user?.username && 
      assignment.role === 'voice-over'
    )
  )

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true)
      // Clear any client-side session data
      if (typeof window !== 'undefined') {
        window.localStorage.clear()
      }
      // Use direct redirect
      await signOut({ 
        redirect: true,
        callbackUrl: '/login'
      })
    } catch (error) {
      console.error('Error during signOut:', error)
      // Fallback redirect if signOut fails
      router.replace('/login')
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6 w-full">
          <h1 className="text-2xl font-bold text-foreground">Your Projects</h1>
          <button 
            onClick={handleLogout}
            disabled={isLoggingOut}
            className={`z-50 px-4 py-2 rounded transition-colors ${
              isLoggingOut 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-red-500 hover:bg-red-600'
            } text-white`}
          >
            {isLoggingOut ? 'Logging out...' : 'Logout'}
          </button>
        </div>

        {assignedProjects.length === 0 ? (
          <div className="text-center p-4">No projects assigned to you as a voice-over artist.</div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {assignedProjects.map((project) => (
              <div
                key={project._id}
                onClick={() => router.push(`/allDashboards/voice-over/${project._id}`)}
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
        )}
      </div>
    </div>
  )
}

