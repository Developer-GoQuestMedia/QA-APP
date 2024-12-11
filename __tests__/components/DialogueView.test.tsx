import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DialogueView from '@/components/DialogueView'
import '@testing-library/jest-dom'

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>
  },
  useMotionValue: jest.fn(() => ({ get: () => 0 })),
  useTransform: jest.fn(() => ({ get: () => 0 })),
  useAnimation: jest.fn(() => ({
    start: jest.fn(),
    set: jest.fn()
  }))
}))

describe('DialogueView', () => {
  const queryClient = new QueryClient()
  const mockDialogues = [
    {
      _id: '1',
      index: 1,
      timeStart: '00:00:00',
      timeEnd: '00:00:05',
      character: 'Character 1',
      videoUrl: 'http://example.com/video1.mp4',
      dialogue: {
        original: 'Original text 1',
        translated: 'Translated text 1',
        adapted: 'Adapted text 1'
      },
      status: 'pending'
    },
    {
      _id: '2',
      index: 2,
      timeStart: '00:00:05',
      timeEnd: '00:00:10',
      character: 'Character 2',
      videoUrl: 'http://example.com/video2.mp4',
      dialogue: {
        original: 'Original text 2',
        translated: 'Translated text 2',
        adapted: 'Adapted text 2'
      },
      status: 'approved'
    }
  ]

  const renderWithQuery = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    )
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders dialogue information correctly', () => {
    renderWithQuery(<DialogueView dialogues={mockDialogues} projectId="123" />)
    
    expect(screen.getByText('Character 1')).toBeInTheDocument()
    expect(screen.getByText('Original text 1')).toBeInTheDocument()
    expect(screen.getByText('00:00:00 - 00:00:05')).toBeInTheDocument()
  })

  it('handles empty dialogues array', () => {
    renderWithQuery(<DialogueView dialogues={[]} projectId="123" />)
    expect(screen.getByText('No dialogues available.')).toBeInTheDocument()
  })

  it('shows confirmation modal when there are unsaved changes', async () => {
    renderWithQuery(<DialogueView dialogues={mockDialogues} projectId="123" />)
    
    const characterInput = screen.getByLabelText('Character')
    fireEvent.change(characterInput, { target: { value: 'New Character' } })
    
    const nextButton = screen.getByText('Next')
    fireEvent.click(nextButton)
    
    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument()
    expect(screen.getByText('Discard Changes')).toBeInTheDocument()
    expect(screen.getByText('Keep Editing')).toBeInTheDocument()
  })

  it('saves changes when approving dialogue', async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ message: 'Success' })
      })
    )

    renderWithQuery(<DialogueView dialogues={mockDialogues} projectId="123" />)
    
    const characterInput = screen.getByLabelText('Character')
    fireEvent.change(characterInput, { target: { value: 'Updated Character' } })
    
    const approveButton = screen.getByText('Approve & Save')
    fireEvent.click(approveButton)
    
    await waitFor(() => {
      expect(screen.getByText('Saved successfully!')).toBeInTheDocument()
    })
  })

  it('handles API errors when saving', async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: 'Failed to save' })
      })
    )

    renderWithQuery(<DialogueView dialogues={mockDialogues} projectId="123" />)
    
    const approveButton = screen.getByText('Approve & Save')
    fireEvent.click(approveButton)
    
    await waitFor(() => {
      expect(screen.getByText('Failed to save')).toBeInTheDocument()
    })
  })

  it('navigates between dialogues correctly', () => {
    renderWithQuery(<DialogueView dialogues={mockDialogues} projectId="123" />)
    
    expect(screen.getByText('Original text 1')).toBeInTheDocument()
    
    const nextButton = screen.getByText('Next')
    fireEvent.click(nextButton)
    
    expect(screen.getByText('Original text 2')).toBeInTheDocument()
  })

  it('handles video playback controls', () => {
    const { container } = renderWithQuery(
      <DialogueView dialogues={mockDialogues} projectId="123" />
    )
    
    const video = container.querySelector('video')
    expect(video).toHaveAttribute('src', 'http://example.com/video1.mp4')
    expect(video).toHaveAttribute('controls')
  })

  it('validates required fields before saving', async () => {
    renderWithQuery(<DialogueView dialogues={mockDialogues} projectId="123" />)
    
    const originalInput = screen.getByLabelText('Original')
    fireEvent.change(originalInput, { target: { value: '' } })
    
    const approveButton = screen.getByText('Approve & Save')
    fireEvent.click(approveButton)
    
    expect(screen.getByText('Original text is required')).toBeInTheDocument()
  })
}) 