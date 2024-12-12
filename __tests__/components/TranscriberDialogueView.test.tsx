import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TranscriberDialogueView from '@/components/TranscriberDialogueView'
import { renderWithQuery } from '../testUtils'

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onDragEnd, ...props }) => (
      <div data-testid="motion-div" onClick={() => onDragEnd?.({}, { offset: { x: -150 } })} {...props}>
        {children}
      </div>
    )
  },
  useMotionValue: jest.fn(() => ({
    set: jest.fn(),
    get: jest.fn()
  })),
  useTransform: jest.fn(() => ({
    set: jest.fn(),
    get: jest.fn()
  })),
  useAnimation: jest.fn(() => ({
    start: jest.fn()
  }))
}))

const mockDialogues = [
  {
    _id: '1',
    index: 0,
    timeStart: '00:00.000',
    timeEnd: '00:05.000',
    character: 'Character 1',
    videoUrl: 'http://example.com/video1.mp4',
    dialogue: {
      original: 'Original text 1',
      translated: '',
      adapted: '',
    },
    status: 'pending',
  },
  {
    _id: '2',
    index: 1,
    timeStart: '00:05.000',
    timeEnd: '00:10.000',
    character: 'Character 2',
    videoUrl: 'http://example.com/video1.mp4',
    dialogue: {
      original: 'Original text 2',
      translated: '',
      adapted: '',
    },
    status: 'pending',
  },
]

// Mock fetch function
global.fetch = jest.fn()

describe('TranscriberDialogueView', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders without crashing', () => {
    renderWithQuery(<TranscriberDialogueView dialogues={mockDialogues} projectId="123" />)
    expect(screen.getByText('Character')).toBeInTheDocument()
  })

  it('displays "No dialogues available" when dialogues array is empty', () => {
    renderWithQuery(<TranscriberDialogueView dialogues={[]} projectId="123" />)
    expect(screen.getByText('No dialogues available')).toBeInTheDocument()
  })

  it('displays the first dialogue by default', () => {
    renderWithQuery(<TranscriberDialogueView dialogues={mockDialogues} projectId="123" />)
    expect(screen.getByDisplayValue('Character 1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Original text 1')).toBeInTheDocument()
  })

  it('updates character input', () => {
    renderWithQuery(<TranscriberDialogueView dialogues={mockDialogues} projectId="123" />)
    const characterInput = screen.getByLabelText('Character')
    fireEvent.change(characterInput, { target: { value: 'New Character' } })
    expect(characterInput.value).toBe('New Character')
  })

  it('updates transcription text', () => {
    renderWithQuery(<TranscriberDialogueView dialogues={mockDialogues} projectId="123" />)
    const transcriptionArea = screen.getByLabelText('Transcription')
    fireEvent.change(transcriptionArea, { target: { value: 'New transcription text' } })
    expect(transcriptionArea.value).toBe('New transcription text')
  })

  it('shows confirmation modal when trying to navigate with unsaved changes', () => {
    renderWithQuery(<TranscriberDialogueView dialogues={mockDialogues} projectId="123" />)
    
    // Make changes
    const characterInput = screen.getByLabelText('Character')
    fireEvent.change(characterInput, { target: { value: 'New Character' } })
    
    // Try to navigate using motion div
    const motionDiv = screen.getByTestId('motion-div')
    fireEvent.click(motionDiv)
    
    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument()
    expect(screen.getByText('You have unsaved changes. What would you like to do?')).toBeInTheDocument()
  })

  it('saves changes successfully', async () => {
    // Mock successful API response
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve(mockDialogues[0]),
    }
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse)

    renderWithQuery(<TranscriberDialogueView dialogues={mockDialogues} projectId="123" />)
    
    // Make changes
    const characterInput = screen.getByLabelText('Character')
    fireEvent.change(characterInput, { target: { value: 'New Character' } })
    
    // Save changes
    const saveButton = screen.getByText('Save Transcription')
    fireEvent.click(saveButton)
    
    await waitFor(() => {
      expect(screen.getByText('Transcription saved successfully!')).toBeInTheDocument()
    })
  })

  it('handles save error gracefully', async () => {
    // Mock failed API response
    const mockResponse = {
      ok: false,
      json: () => Promise.resolve({ error: 'Failed to save' }),
    }
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse)

    renderWithQuery(<TranscriberDialogueView dialogues={mockDialogues} projectId="123" />)
    
    // Make changes
    const characterInput = screen.getByLabelText('Character')
    fireEvent.change(characterInput, { target: { value: 'New Character' } })
    
    // Try to save
    const saveButton = screen.getByText('Save Transcription')
    fireEvent.click(saveButton)
    
    await waitFor(() => {
      expect(screen.getByText('Failed to save')).toBeInTheDocument()
    })
  })

  it('handles video playback controls', () => {
    renderWithQuery(<TranscriberDialogueView dialogues={mockDialogues} projectId="123" />)
    
    expect(screen.getByText('Play')).toBeInTheDocument()
    expect(screen.getByText('-5s')).toBeInTheDocument()
    expect(screen.getByText('Speed:')).toBeInTheDocument()
    expect(screen.getByText('1x')).toBeInTheDocument()
  })

  it('displays time values correctly', () => {
    const dialoguesWithTime = [{
      ...mockDialogues[0],
      timeStart: '00:30.500',
      timeEnd: '00:35.750'
    }]
    
    renderWithQuery(<TranscriberDialogueView dialogues={dialoguesWithTime} projectId="123" />)
    
    const startTime = screen.getByText('00:30.500')
    const endTime = screen.getByText('00:35.750')
    
    expect(startTime).toBeInTheDocument()
    expect(endTime).toBeInTheDocument()
  })

  it('displays default time format when times are not set', () => {
    const dialoguesWithoutTime = [{
      ...mockDialogues[0],
      timeStart: '',
      timeEnd: ''
    }]
    
    renderWithQuery(<TranscriberDialogueView dialogues={dialoguesWithoutTime} projectId="123" />)
    
    const defaultTime = screen.getAllByText('00:00.000')
    expect(defaultTime).toHaveLength(2) // Both start and end time show default
  })
}) 