'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import SrDirectorView from '@/components/SrDirectorView'

interface PageProps {
  params: {
    projectId: string
    episodeName: string
  }
}

export default function SrDirectorDialoguesPage({ params }: PageProps) {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
    } else if (session?.user?.role !== 'srDirector') {
      router.replace('/unauthorized' as any)
    }
  }, [session, status, router])

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!session || session.user.role !== 'srDirector') {
    return null
  }

  return <SrDirectorView projectId={params.projectId} />
} 