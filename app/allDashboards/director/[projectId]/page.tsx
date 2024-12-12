'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useDialogues } from '@/hooks/useDialogues'
import DirectorDialogueView from '../../../../components/DirectorDialogueView'

export default function DirectorProjectPage({
  params,
}: {
  params: { projectId: string }
}) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { data: dialogues, isLoading } = useDialogues(params.projectId)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session?.user?.role !== 'director') {
      router.push('/login')
    }
  }, [status, session, router])

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-7xl mx-auto py-4 sm:py-6">
        <div className="flex justify-between items-center mb-4 sm:mb-6 px-4">
          <button
            onClick={() => router.push('/allDashboards/director')}
            className="text-primary hover:text-primary/80 transition-colors text-sm sm:text-base"
          >
            ← Back to Projects
          </button>
        </div>
        <DirectorDialogueView dialogues={dialogues || []} projectId={params.projectId} />
      </div>
    </div>
  )
} 