import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { performLogout } from '@/lib/auth/logout'

export default function Navigation() {
  const { data: session } = useSession()
  const router = useRouter()

  const handleLogout = async () => {
    try {
      await performLogout()
    } catch (error) {
      console.error('Error during logout:', error)
      // Force redirect to login page even if there's an error
      router.push('/login')
    }
  }

  if (!session) return null

  return (
    <nav className="bg-card shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <span className="text-xl font-bold text-foreground">
                QA App
              </span>
            </div>
          </div>
          
          <div className="flex items-center">
            <div className="flex items-center space-x-4">
              <span className="text-sm text-foreground">
                {session.user?.username} ({session.user?.role})
              </span>
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
} 