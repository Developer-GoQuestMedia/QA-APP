'use client'

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
}

export default function ErrorState({ 
  title = 'Error', 
  message, 
  onRetry 
}: ErrorStateProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg max-w-lg">
        <p className="font-semibold mb-2">{title}</p>
        <p>{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  )
} 