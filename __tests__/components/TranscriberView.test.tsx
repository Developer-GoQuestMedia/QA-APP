import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import TranscriberView from '@/components/TranscriberView'
import '@testing-library/jest-dom'

// Mock next-auth
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signOut: jest.fn()
}))

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn()
}))

describe('TranscriberView', () => {
  const mockRouter = {
    push: jest.fn()
  }

  const mockProjects = [
    {
      _id: '1',
      title: 'Test Project 1',
      description: 'Test Description 1',
      sourceLanguage: 'English',
      targetLanguage: 'Spanish',
      status: 'active',
      assignedTo: [
        { username: 'transcriber1', role: 'transcriber' }
      ]
    },
    {
      _id: '2',
      title: 'Test Project 2',
      description: 'Test Description 2',
      sourceLanguage: 'French',
      targetLanguage: 'German',
      status: 'pending',
      assignedTo: [
        { username: 'transcriber1', role: 'transcriber' }
      ]
    }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue(mockRouter)
    ;(useSession as jest.Mock).mockReturnValue({
      data: {
        user: {
          username: 'transcriber1',
          role: 'transcriber'
        }
      },
      status: 'authenticated'
    })
  })

  // Basic Rendering Tests
  describe('Rendering', () => {
    it('renders project cards correctly', () => {
      render(<TranscriberView projects={mockProjects} />)
      
      expect(screen.getByText('Test Project 1')).toBeInTheDocument()
      expect(screen.getByText('Test Project 2')).toBeInTheDocument()
      expect(screen.getByText('English → Spanish')).toBeInTheDocument()
      expect(screen.getByText('French → German')).toBeInTheDocument()
    })

    it('displays no projects message when no projects are assigned', () => {
      render(<TranscriberView projects={[]} />)
      expect(screen.getByText('No projects assigned to you as a transcriber.')).toBeInTheDocument()
    })

    it('renders project status correctly', () => {
      render(<TranscriberView projects={mockProjects} />)
      expect(screen.getByText('Status: active')).toBeInTheDocument()
      expect(screen.getByText('Status: pending')).toBeInTheDocument()
    })

    it('renders logout button', () => {
      render(<TranscriberView projects={mockProjects} />)
      expect(screen.getByText('Logout')).toBeInTheDocument()
    })
  })

  // Navigation Tests
  describe('Navigation', () => {
    it('navigates to project details when clicking a project card', async () => {
      render(<TranscriberView projects={mockProjects} />)
      
      const projectCard = screen.getByText('Test Project 1').closest('div[role="button"]')
      fireEvent.click(projectCard!)
      
      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/allDashboards/transcriber/1')
      })
    })

    it('prevents navigation when project card is disabled', () => {
      const disabledProjects = [{
        ...mockProjects[0],
        status: 'locked'
      }]
      render(<TranscriberView projects={disabledProjects} />)
      
      const projectCard = screen.getByText('Test Project 1').closest('div[role="button"]')
      fireEvent.click(projectCard!)
      
      expect(mockRouter.push).not.toHaveBeenCalled()
    })
  })

  // Authentication Tests
  describe('Authentication', () => {
    it('handles logout correctly', async () => {
      const mockSignOut = jest.fn()
      ;(useSession as jest.Mock).mockReturnValue({
        data: { user: { username: 'transcriber1', role: 'transcriber' } },
        status: 'authenticated',
        signOut: mockSignOut
      })

      render(<TranscriberView projects={mockProjects} />)
      
      const logoutButton = screen.getByText('Logout')
      fireEvent.click(logoutButton)
      
      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledWith({ 
          redirect: true, 
          callbackUrl: '/login' 
        })
      })
    })

    it('displays loading state when logging out', async () => {
      render(<TranscriberView projects={mockProjects} />)
      
      const logoutButton = screen.getByText('Logout')
      fireEvent.click(logoutButton)
      
      expect(screen.getByText('Logging out...')).toBeInTheDocument()
      expect(logoutButton).toBeDisabled()
    })

    it('handles failed logout', async () => {
      const mockSignOut = jest.fn().mockRejectedValue(new Error('Logout failed'))
      ;(useSession as jest.Mock).mockReturnValue({
        data: { user: { username: 'transcriber1', role: 'transcriber' } },
        status: 'authenticated',
        signOut: mockSignOut
      })

      render(<TranscriberView projects={mockProjects} />)
      
      const logoutButton = screen.getByText('Logout')
      fireEvent.click(logoutButton)
      
      await waitFor(() => {
        expect(screen.getByText('Error logging out')).toBeInTheDocument()
      })
    })
  })

  // Project Filtering Tests
  describe('Project Filtering', () => {
    it('filters projects correctly based on user assignment', () => {
      const projectsWithDifferentAssignments = [
        ...mockProjects,
        {
          _id: '3',
          title: 'Not Assigned Project',
          description: 'Should not show up',
          sourceLanguage: 'English',
          targetLanguage: 'French',
          status: 'active',
          assignedTo: [
            { username: 'someone_else', role: 'transcriber' }
          ]
        }
      ]

      render(<TranscriberView projects={projectsWithDifferentAssignments} />)
      
      expect(screen.getByText('Test Project 1')).toBeInTheDocument()
      expect(screen.getByText('Test Project 2')).toBeInTheDocument()
      expect(screen.queryByText('Not Assigned Project')).not.toBeInTheDocument()
    })

    it('filters out projects with different roles', () => {
      const projectsWithDifferentRoles = [
        ...mockProjects,
        {
          _id: '3',
          title: 'Wrong Role Project',
          description: 'Should not show up',
          sourceLanguage: 'English',
          targetLanguage: 'French',
          status: 'active',
          assignedTo: [
            { username: 'transcriber1', role: 'translator' }
          ]
        }
      ]

      render(<TranscriberView projects={projectsWithDifferentRoles} />)
      expect(screen.queryByText('Wrong Role Project')).not.toBeInTheDocument()
    })
  })

  // Edge Cases Tests
  describe('Edge Cases', () => {
    it('handles projects with missing optional fields', () => {
      const incompleteProject = [{
        _id: '1',
        title: 'Incomplete Project',
        description: '',
        sourceLanguage: 'English',
        targetLanguage: '',
        status: 'active',
        assignedTo: [
          { username: 'transcriber1', role: 'transcriber' }
        ]
      }]

      render(<TranscriberView projects={incompleteProject} />)
      
      expect(screen.getByText('Incomplete Project')).toBeInTheDocument()
      expect(screen.getByText('Status: active')).toBeInTheDocument()
    })

    it('handles null values in project fields', () => {
      const projectWithNulls = [{
        _id: '1',
        title: 'Null Project',
        description: null,
        sourceLanguage: null,
        targetLanguage: null,
        status: 'active',
        assignedTo: [
          { username: 'transcriber1', role: 'transcriber' }
        ]
      }]

      render(<TranscriberView projects={projectWithNulls} />)
      expect(screen.getByText('Null Project')).toBeInTheDocument()
    })

    it('handles undefined assignedTo array', () => {
      const projectWithoutAssignments = [{
        _id: '1',
        title: 'No Assignments',
        description: 'Test',
        sourceLanguage: 'English',
        targetLanguage: 'Spanish',
        status: 'active',
        assignedTo: undefined
      }]

      render(<TranscriberView projects={projectWithoutAssignments} />)
      expect(screen.getByText('No projects assigned to you as a transcriber.')).toBeInTheDocument()
    })
  })

  // Accessibility Tests
  describe('Accessibility', () => {
    it('has accessible buttons and links', () => {
      render(<TranscriberView projects={mockProjects} />)
      
      const logoutButton = screen.getByText('Logout')
      expect(logoutButton).toHaveAttribute('role', 'button')
      
      const projectCards = screen.getAllByRole('button')
      expect(projectCards.length).toBeGreaterThan(0)
    })

    it('provides proper aria-labels', () => {
      render(<TranscriberView projects={mockProjects} />)
      
      const projectCards = screen.getAllByRole('button')
      projectCards.forEach(card => {
        expect(card).toHaveAttribute('aria-label')
      })
    })
  })
}) 