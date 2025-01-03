import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import TranscriberView from '@/components/TranscriberView'
import { Project } from '@/types/project'
import '@testing-library/jest-dom'

jest.mock('next-auth/react')
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

describe('TranscriberView', () => {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
  }

  const mockSession = {
    data: {
      user: { 
        role: 'transcriber' as const,
        username: 'testuser',
      },
    },
    status: 'authenticated' as const,
  }

  const mockProjects: Project[] = [{
    _id: 'project1',
    title: 'Test Project 1',
    description: 'Test Description 1',
    sourceLanguage: 'English',
    targetLanguage: 'Spanish',
    status: 'active',
    assignedTo: [{
      username: 'testuser',
      role: 'transcriber',
    }],
  }, {
    _id: 'project2',
    title: 'Test Project 2',
    description: 'Test Description 2',
    sourceLanguage: 'French',
    targetLanguage: 'German',
    status: 'pending',
    assignedTo: [{
      username: 'testuser',
      role: 'transcriber',
    }],
  }]

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useSession as jest.Mock).mockReturnValue(mockSession)
    ;(useRouter as jest.Mock).mockReturnValue(mockRouter)
    ;(signOut as jest.Mock).mockImplementation(() => Promise.resolve())
    // Clear localStorage before each test
    if (typeof window !== 'undefined') {
      window.localStorage.clear()
    }
  })

  describe('Rendering', () => {
    it('renders project cards correctly', () => {
      render(<TranscriberView projects={mockProjects} />)
      
      expect(screen.getByText('Test Project 1')).toBeInTheDocument()
      expect(screen.getByText('Test Project 2')).toBeInTheDocument()
      expect(screen.getByText('Source Language: English')).toBeInTheDocument()
      expect(screen.getByText('Source Language: French')).toBeInTheDocument()
    })

    it('displays no projects message when user has no assignments', () => {
      const projectWithoutAssignments = [{
        ...mockProjects[0],
        assignedTo: [{
          username: 'otheruser',
          role: 'transcriber',
        }],
      }]

      render(<TranscriberView projects={projectWithoutAssignments} />)
      expect(screen.getByText('No projects assigned to you as a transcriber.')).toBeInTheDocument()
    })
  })

  describe('Navigation', () => {
    it('navigates to project details when clicking a project card', async () => {
      render(<TranscriberView projects={mockProjects} />)
      
      const projectCard = screen.getByText('Test Project 1').closest('div')
      expect(projectCard).toHaveAttribute('role', 'button')
      
      await act(async () => {
        fireEvent.click(projectCard!)
      })

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/allDashboards/transcriber/project1')
      })
    })

    it('prevents navigation when project card is disabled', async () => {
      const disabledProjects = [{
        ...mockProjects[0],
        status: 'locked',
      }]

      render(<TranscriberView projects={disabledProjects} />)
      
      const projectCard = screen.getByText('Test Project 1').closest('div')
      expect(projectCard).toHaveAttribute('aria-disabled', 'true')
      
      await act(async () => {
        fireEvent.click(projectCard!)
      })
      
      expect(mockRouter.push).not.toHaveBeenCalled()
    })
  })

  describe('Authentication', () => {
    it('handles logout correctly', async () => {
      render(<TranscriberView projects={mockProjects} />)
      
      const logoutButton = screen.getByRole('button', { name: /logout/i })
      
      await act(async () => {
        fireEvent.click(logoutButton)
      })

      await waitFor(() => {
        expect(signOut).toHaveBeenCalledWith({ 
          redirect: true, 
          callbackUrl: '/login' 
        })
        expect(window.localStorage.length).toBe(0)
      })
    })

    it('handles failed logout', async () => {
      // Mock signOut to fail
      const mockError = new Error('Logout failed')
      ;(signOut as jest.Mock).mockRejectedValueOnce(mockError)

      render(<TranscriberView projects={mockProjects} />)
      
      const logoutButton = screen.getByRole('button', { name: /logout/i })
      
      await act(async () => {
        fireEvent.click(logoutButton)
      })

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/login')
      })
    })
  })

  describe('Edge Cases', () => {
    it('handles projects with empty assignedTo array', () => {
      const projectWithoutAssignedTo = [{
        ...mockProjects[0],
        assignedTo: [],
      }]

      render(<TranscriberView projects={projectWithoutAssignedTo} />)
      expect(screen.getByText('No projects assigned to you as a transcriber.')).toBeInTheDocument()
    })

    it('handles empty projects array', () => {
      render(<TranscriberView projects={[]} />)
      expect(screen.getByText('No projects assigned to you as a transcriber.')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('has accessible buttons and links', () => {
      render(<TranscriberView projects={mockProjects} />)
      
      const logoutButton = screen.getByRole('button', { name: /logout/i })
      expect(logoutButton).toHaveAttribute('aria-label', 'Logout')
      
      const projectCards = screen.getAllByRole('button')
      expect(projectCards.length).toBeGreaterThan(0)
      projectCards.forEach(card => {
        expect(card).toHaveAttribute('aria-label')
      })
    })

    it('provides proper keyboard navigation', () => {
      render(<TranscriberView projects={mockProjects} />)
      
      const projectCards = screen.getAllByRole('button')
      projectCards.forEach(card => {
        expect(card).toHaveAttribute('tabIndex', '0')
      })
    })
  })
}) 