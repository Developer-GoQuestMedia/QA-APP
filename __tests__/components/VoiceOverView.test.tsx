import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import VoiceOverView from '@/components/VoiceOverView'

jest.mock('next-auth/react')
jest.mock('react-swipeable', () => ({
  useSwipeable: () => ({
    ref: jest.fn(),
    onMouseDown: jest.fn(),
    onTouchStart: jest.fn(),
  }),
}))

// Mock MediaStream
class MockMediaStream {
  constructor() {
    return {
      getTracks: () => [],
      getAudioTracks: () => [],
      getVideoTracks: () => [],
      addTrack: jest.fn(),
      removeTrack: jest.fn(),
    }
  }
}

global.MediaStream = MockMediaStream as any

describe('VoiceOverView Component', () => {
  const mockSession = {
    data: {
      user: { role: 'voice-over' },
    },
    status: 'authenticated',
  }

  const mockProjects = [{
    _id: 'project1',
    title: 'Test Project',
    dialogues: [{
      _id: 'dialogue1',
      timeStart: '00:00:00:000',
      timeEnd: '00:00:02:000',
      character: 'Test Character',
      videoUrl: 'test-video-url',
      dialogue: {
        original: 'Original text',
        translated: 'Translated text',
        adapted: 'Adapted text',
      },
      status: 'pending',
    }],
  }]

  let mockMediaRecorder: any

  beforeEach(() => {
    jest.useFakeTimers()
    ;(useSession as jest.Mock).mockReturnValue(mockSession)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProjects[0].dialogues),
    })

    mockMediaRecorder = {
      start: jest.fn(),
      stop: jest.fn(),
      ondataavailable: jest.fn(),
      onstop: jest.fn(),
      state: 'inactive',
    }

    const MediaRecorderMock = jest.fn(() => mockMediaRecorder) as jest.Mock & {
      isTypeSupported: (type: string) => boolean
    }
    MediaRecorderMock.isTypeSupported = jest.fn().mockReturnValue(true)

    // @ts-ignore - Readonly property workaround for test environment
    global.MediaRecorder = MediaRecorderMock

    // @ts-ignore - Readonly property workaround for test environment
    global.navigator.mediaDevices = {
      getUserMedia: jest.fn().mockResolvedValue(new MockMediaStream()),
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.useRealTimers()
  })

  it('renders voice-over interface', async () => {
    render(<VoiceOverView projects={mockProjects} />)

    await waitFor(() => {
      expect(screen.getByText('Character')).toBeInTheDocument()
      expect(screen.getByText('Test Character')).toBeInTheDocument()
      expect(screen.getByText('Original')).toBeInTheDocument()
      expect(screen.getByText('Original text')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument()
    })
  })

  it('handles recording start and stop', async () => {
    render(<VoiceOverView projects={mockProjects} />)

    // Start recording
    const startButton = await screen.findByRole('button', { name: /start recording/i })
    await act(async () => {
      fireEvent.click(startButton)
    })

    // Check initial countdown
    expect(screen.getByText(/3/)).toBeInTheDocument()
    
    // Fast-forward through countdown
    await act(async () => {
      jest.advanceTimersByTime(3000)
    })

    // Wait for recording state
    await waitFor(() => {
      expect(global.navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true })
      expect(mockMediaRecorder.start).toHaveBeenCalled()
    })

    // Simulate MediaRecorder state change
    mockMediaRecorder.state = 'recording'

    // Verify recording button state
    const stopButton = screen.getByRole('button', { name: /stop recording/i })
    expect(stopButton).toBeInTheDocument()

    // Stop recording
    await act(async () => {
      fireEvent.click(stopButton)
      mockMediaRecorder.state = 'inactive'
    })

    await waitFor(() => {
      expect(mockMediaRecorder.stop).toHaveBeenCalled()
    })
  })

  it('handles navigation between dialogues', async () => {
    const mockDialogues = [
      ...mockProjects[0].dialogues,
      {
        _id: 'dialogue2',
        timeStart: '00:00:02:000',
        timeEnd: '00:00:04:000',
        character: 'Another Character',
        videoUrl: 'test-video-url-2',
        dialogue: {
          original: 'Second original text',
          translated: 'Second translated text',
          adapted: 'Second adapted text',
        },
        status: 'pending',
      },
    ]

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDialogues),
    })

    render(<VoiceOverView projects={mockProjects} />)

    // Wait for initial render
    await screen.findByText('Test Character')

    // Navigate to next dialogue
    const nextButton = screen.getByRole('button', { name: /next/i })
    await act(async () => {
      fireEvent.click(nextButton)
    })

    await waitFor(() => {
      expect(screen.getByText('Another Character')).toBeInTheDocument()
      expect(screen.getByText('Second original text')).toBeInTheDocument()
    })

    // Navigate back
    const prevButton = screen.getByRole('button', { name: /previous/i })
    await act(async () => {
      fireEvent.click(prevButton)
    })

    await waitFor(() => {
      expect(screen.getByText('Test Character')).toBeInTheDocument()
      expect(screen.getByText('Original text')).toBeInTheDocument()
    })
  })
}) 