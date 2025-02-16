'use client'

interface LoadingStateProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
}

export default function LoadingState({ message = 'Loading...', size = 'md' }: LoadingStateProps) {
  const spinnerSizes = {
    sm: 'h-8 w-8',
    md: 'h-12 w-12',
    lg: 'h-16 w-16'
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-3">
        <div 
          className={`animate-spin rounded-full border-t-2 border-b-2 border-primary mx-auto ${spinnerSizes[size]}`}
        />
        <p className="text-foreground">{message}</p>
      </div>
    </div>
  )
} 