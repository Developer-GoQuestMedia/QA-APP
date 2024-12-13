import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import VoiceOverDialogueView from '@/components/VoiceOverDialogueView'
import type { Dialogue } from '@/types/dialogue'
import '@testing-library/jest-dom'

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode; [key: string]: any }) => (
      <div {...props}>{children}</div>
    ),
  },
  useMotionValue: jest.fn(() => ({
    set: jest.fn(),
    get: jest.fn(),
  })),
  useTransform: jest.fn(),
  useAnimation: jest.fn(() => ({
    start: jest.fn(),
  })),
}))

interface MockMediaStream {
  getTracks: () => { stop: () => void }[];
}

interface MockMediaStreamSource {
  connect: jest.Mock;
  disconnect: jest.Mock;
  mediaStream: MockMediaStream;
}

interface MockGainNode {
  connect: jest.Mock;
  gain: { value: number };
}

// Mock Audio Context and related APIs
class MockAudioContext {
  createMediaStreamSource = jest.fn((): MockMediaStreamSource => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    mediaStream: {
      getTracks: () => [{
        stop: jest.fn(),
      }],
    },
  }))

  createGain = jest.fn((): MockGainNode => ({
    connect: jest.fn(),
    gain: { value: 1 },
  }))

  destination = {}
  sampleRate = 44100
  close = jest.fn()
  audioWorklet = {
    addModule: jest.fn().mockResolvedValue(undefined),
  }

  createBuffer = jest.fn(() => ({
    duration: 2,
    numberOfChannels: 2,
    sampleRate: 44100,
    getChannelData: jest.fn(() => new Float32Array([0, 0.1, -0.1])),
  }))

  createBufferSource = jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    buffer: null,
  }))
}

class MockAudioWorkletNode {
  connect = jest.fn()
  disconnect = jest.fn()
  port = {
    onmessage: jest.fn(),
    postMessage: jest.fn(),
  }
}

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'mock-url')
global.URL.revokeObjectURL = jest.fn()

global.AudioContext = MockAudioContext as any
global.AudioWorkletNode = MockAudioWorkletNode as any

// Mock HTMLMediaElement methods
Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: jest.fn().mockResolvedValue(undefined),
})

Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value: jest.fn(),
})

Object.defineProperty(window.HTMLMediaElement.prototype, 'load', {
  configurable: true,
  value: jest.fn(),
})

// Mock createWorker
jest.mock('@/utils/audio', () => ({
  createWorker: jest.fn().mockResolvedValue({
    connect: jest.fn(),
    disconnect: jest.fn(),
    port: {
      onmessage: jest.fn((event: (arg: { data: { audioData: Float32Array[] } }) => void) => {
        event({
          data: {
            audioData: [new Float32Array([0, 0.1, -0.1]), new Float32Array([0, 0.2, -0.2])],
          },
        })
      }),
      postMessage: jest.fn(),
    },
  }),
  createWavBlob: jest.fn().mockReturnValue(new Blob(['mock-audio-data'], { type: 'audio/wav' })),
}))

describe('VoiceOverDialogueView Component', () => {
  const mockDialogues: Dialogue[] = [
    {
      _id: 'dialogue1',
      index: 0,
      timeStart: '00:00:00:000',
      timeEnd: '00:00:02:000',
      character: 'Character 1',
      videoUrl: 'test-video-url-1',
      dialogue: {
        original: 'Original text 1',
        translated: 'Translated text 1',
        adapted: 'Adapted text 1',
      },
      emotions: {
        primary: {
          emotion: 'happy',
          intensity: 5,
        },
        secondary: {
          emotion: 'excited',
          intensity: 3,
        },
      },
      direction: 'Test direction',
      lipMovements: 2,
      sceneContext: 'Test scene context',
      technicalNotes: 'Test technical notes',
      culturalNotes: 'Test cultural notes',
      status: 'pending',
      recordingStatus: 'not-started',
      projectId: 'project1',
      updatedAt: '2024-01-01',
      updatedBy: 'user1',
      voiceOverUrl: undefined,
    },
    {
      _id: 'dialogue2',
      index: 1,
      timeStart: '00:00:02:000',
      timeEnd: '00:00:04:000',
      character: 'Character 2',
      videoUrl: 'test-video-url-2',
      dialogue: {
        original: 'Original text 2',
        translated: 'Translated text 2',
        adapted: 'Adapted text 2',
      },
      emotions: {
        primary: {
          emotion: 'sad',
          intensity: 4,
        },
        secondary: {
          emotion: 'worried',
          intensity: 2,
        },
      },
      direction: 'Test direction 2',
      lipMovements: 3,
      sceneContext: 'Test scene context 2',
      technicalNotes: 'Test technical notes 2',
      culturalNotes: 'Test cultural notes 2',
      status: 'pending',
      recordingStatus: 'not-started',
      projectId: 'project1',
      updatedAt: '2024-01-01',
      updatedBy: 'user1',
      voiceOverUrl: undefined,
    },
  ]

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <VoiceOverDialogueView dialogues={mockDialogues as Dialogue[]} projectId="project1" />
      </QueryClientProvider>
    )
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    // Mock getUserMedia
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: jest.fn().mockResolvedValue({
          getTracks: () => [{
            stop: jest.fn(),
          }],
        }),
      },
      writable: true,
    })

    // Mock fetch
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ url: 'test-voice-over-url' }),
      })
    )

    // Reset URL.createObjectURL mock
    ;(global.URL.createObjectURL as jest.Mock).mockReset()
    ;(global.URL.createObjectURL as jest.Mock).mockReturnValue('mock-url')

    // Mock window.confirm
    window.confirm = jest.fn(() => true)
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.useRealTimers()
  })

  it('renders initial dialogue correctly', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Character 1')).toBeInTheDocument()
      expect(screen.getByText('Original text 1')).toBeInTheDocument()
      expect(screen.getByText('Translated text 1')).toBeInTheDocument()
      expect(screen.getByText('Adapted text 1')).toBeInTheDocument()
    })
  })

  it('handles recording start and stop', async () => {
    renderComponent()

    const startButton = screen.getByText('Start Recording')
    await act(async () => {
      fireEvent.click(startButton)
      // Wait for async operations
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled()
    })

    // Wait for countdown
    await act(async () => {
      jest.advanceTimersByTime(4000)
      await Promise.resolve()
    })

    const stopButton = screen.getByText('Stop Recording')
    await act(async () => {
      fireEvent.click(stopButton)
      // Wait for async operations
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByText('Start Recording')).toBeInTheDocument()
    })
  })

  it('handles navigation between dialogues', async () => {
    renderComponent()

    // Check initial dialogue
    expect(screen.getByText('Character 1')).toBeInTheDocument()

    // Navigate to next dialogue
    const nextButton = screen.getByRole('button', { name: /next/i })
    await act(async () => {
      fireEvent.click(nextButton)
      // Wait for async operations
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByText('Character 2')).toBeInTheDocument()
      expect(screen.getByText('Original text 2')).toBeInTheDocument()
    })

    // Navigate back
    const prevButton = screen.getByRole('button', { name: /previous/i })
    await act(async () => {
      fireEvent.click(prevButton)
      // Wait for async operations
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByText('Character 1')).toBeInTheDocument()
      expect(screen.getByText('Original text 1')).toBeInTheDocument()
    })
  })

  it('shows confirmation dialog when navigating with unsaved changes', async () => {
    renderComponent()

    // Start and stop recording to create unsaved changes
    const startButton = screen.getByText('Start Recording')
    await act(async () => {
      fireEvent.click(startButton)
      // Wait for async operations
      await Promise.resolve()
    })

    // Wait for countdown
    await act(async () => {
      jest.advanceTimersByTime(1000)
      expect(screen.getByText('3')).toBeInTheDocument()
      jest.advanceTimersByTime(1000)
      expect(screen.getByText('2')).toBeInTheDocument()
      jest.advanceTimersByTime(1000)
      expect(screen.getByText('1')).toBeInTheDocument()
      jest.advanceTimersByTime(1000)
      // Wait for async operations
      await Promise.resolve()
    })

    const stopButton = screen.getByText('Stop Recording')
    await act(async () => {
      fireEvent.click(stopButton)
      // Wait for async operations
      await Promise.resolve()
    })

    // Try to navigate
    const nextButton = screen.getByText('Next')
    await act(async () => {
      fireEvent.click(nextButton)
      // Wait for async operations
      await Promise.resolve()
    })

    // Check for confirmation dialog
    expect(window.confirm).toHaveBeenCalled()
  })

  it('handles video playback controls', async () => {
    renderComponent()

    const video = screen.getByTestId('dialogue-video') as HTMLVideoElement
    
    // Test play/pause
    const playButton = screen.getByText('Play')
    await act(async () => {
      fireEvent.click(playButton)
      // Wait for async operations
      await Promise.resolve()
    })
    expect(video.play).toHaveBeenCalled()

    // Test rewind
    const rewindButton = screen.getByText('Rewind')
    await act(async () => {
      fireEvent.click(rewindButton)
      // Wait for async operations
      await Promise.resolve()
    })
    expect(video.currentTime).toBe(0)

    // Test playback rate
    const playbackRateButton = screen.getByText('1x')
    await act(async () => {
      fireEvent.click(playbackRateButton)
      // Wait for async operations
      await Promise.resolve()
    })
    expect(video.playbackRate).toBe(1.5)
  })

  it('handles save functionality', async () => {
    renderComponent()

    // Create a recording
    const startButton = screen.getByText('Start Recording')
    await act(async () => {
      fireEvent.click(startButton)
      // Wait for async operations
      await Promise.resolve()
    })

    // Wait for countdown
    await act(async () => {
      jest.advanceTimersByTime(4000)
      await Promise.resolve()
    })

    const stopButton = screen.getByText('Stop Recording')
    await act(async () => {
      fireEvent.click(stopButton)
      // Wait for async operations
      await Promise.resolve()
    })

    // Wait for audio processing
    await act(async () => {
      await Promise.resolve()
    })

    // Try to save
    const saveButton = screen.getByText('Add Voice-over')
    await act(async () => {
      fireEvent.click(saveButton)
      // Wait for async operations
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/upload-voice-over', expect.any(Object))
      expect(screen.getByText(/saved successfully/i)).toBeInTheDocument()
    }, { timeout: 10000 })
  })

  it('handles recording errors', async () => {
    // Mock getUserMedia to fail
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: jest.fn().mockRejectedValue(new Error('Permission denied')),
      },
      writable: true,
    })

    renderComponent()

    const startButton = screen.getByText('Start Recording')
    await act(async () => {
      fireEvent.click(startButton)
    })

    await waitFor(() => {
      expect(screen.getByText(/permission denied/i)).toBeInTheDocument()
    })
  })

  it('handles save errors', async () => {
    // Mock fetch to fail
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })
    )

    renderComponent()

    // Create a recording
    const startButton = screen.getByText('Start Recording')
    await act(async () => {
      fireEvent.click(startButton)
      // Wait for async operations
      await Promise.resolve()
    })

    // Wait for countdown
    await act(async () => {
      jest.advanceTimersByTime(4000)
      await Promise.resolve()
    })

    const stopButton = screen.getByText('Stop Recording')
    await act(async () => {
      fireEvent.click(stopButton)
      // Wait for async operations
      await Promise.resolve()
    })

    // Wait for audio processing
    await act(async () => {
      await Promise.resolve()
    })

    // Try to save
    const saveButton = screen.getByText('Add Voice-over')
    await act(async () => {
      fireEvent.click(saveButton)
      // Wait for async operations
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByText(/failed to save/i)).toBeInTheDocument()
    }, { timeout: 10000 })
  })
}) 