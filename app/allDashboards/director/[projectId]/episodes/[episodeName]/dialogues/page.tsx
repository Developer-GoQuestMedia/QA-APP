'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import DirectorDialogueView from '@/components/DirectorDialogueView'
import { useDialogues } from '@/hooks/useDialogues'

interface PageProps {
  params: {
    projectId: string
    episodeName: string
  }
}

export default function DirectorDialoguesPage({ params }: PageProps) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { data: dialogues, isLoading } = useDialogues(params.projectId)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
    } else if (session?.user?.role !== 'director') {
      router.replace('/unauthorized' as any)
    }
  }, [session, status, router])

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!session || session.user.role !== 'director') {
    return null
  }

  return <DirectorDialogueView dialogues={dialogues || []} projectId={params.projectId} />
} 