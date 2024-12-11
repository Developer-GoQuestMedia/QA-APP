'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useDialogues } from '@/hooks/useDialogues'
import DialogueView from '@/components/DialogueView'

export default function TranscriberProjectPage({
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
    } else if (session?.user?.role !== 'transcriber') {
      router.push('/login')
    }
  }, [status, session, router])

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
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
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => router.push('/allDashboards/transcriber')}
            className="text-primary hover:text-primary/80 transition-colors"
          >
            ← Back to Projects
          </button>
        </div>
        <DialogueView dialogues={dialogues || []} projectId={params.projectId} />
      </div>
    </div>
  )
} 