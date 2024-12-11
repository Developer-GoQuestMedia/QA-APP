'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import TranslatorView from '@/components/TranslatorView'

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

const TranslatorDashboard = () => {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session?.user?.role !== 'translator') {
      // Redirect if user is not a translator
      router.push('/login')
    }
  }, [status, session, router])

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/projects')
        if (!res.ok) {
          console.error('Failed to fetch projects:', await res.text())
          return
        }
        const data = await res.json()
        setProjects(data)
      } catch (error) {
        console.error('Error fetching projects:', error)
      }
    }
    fetchProjects()
  }, [])

  if (status === 'loading') {
    return <div>Loading...</div>
  }

  if (!session) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Translator Dashboard</h1>
        <button 
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors"
        >
          Logout
        </button>
      </div>
      <TranslatorView projects={projects} />
    </div>
  )
}

export default TranslatorDashboard 