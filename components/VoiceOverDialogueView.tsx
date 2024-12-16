import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, useMotionValue, useTransform, useAnimation, type PanInfo } from 'framer-motion'
import { type Dialogue } from '../types/dialogue'
import { formatTime, getNumberValue, calculateDuration } from '../utils/formatters'
import { useAudioRecording } from '../hooks/useAudioRecording'

// Sub-components
const CharacterInfo = ({ character }: { character: string }) => (
  <div className="p-2 bg-gray-800">
    <div className="flex items-center justify-center gap-2">
      <span className="text-gray-400">Character:</span>
      <span className="text-white">{character}</span>
    </div>
  </div>
)

const VideoPlayer = ({ 
  videoRef, 
  videoUrl, 
  isVideoLoading 
}: { 
  videoRef: React.RefObject<HTMLVideoElement>,
  videoUrl: string,
  isVideoLoading: boolean
}) => (
  <div className="relative">
    <video
      ref={videoRef}
      src={videoUrl}
      className="w-full aspect-video max-h-[200px] object-contain bg-black"
      aria-label="Dialogue video player"
    />
    {isVideoLoading && (
      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
      </div>
    )}
  </div>
)

const VideoControls = ({
  isPlaying,
  togglePlayPause,
  toggleAudioImposition,
  isImposedAudio,
  hasAudio,
  timeStart,
  timeEnd
}: {
  isPlaying: boolean,
  togglePlayPause: () => void,
  toggleAudioImposition: () => void,
  isImposedAudio: boolean,
  hasAudio: boolean,
  timeStart: string,
  timeEnd: string
}) => (
  <div className="p-2 bg-gray-800 flex flex-col items-center gap-2">
    <div className="flex gap-2">
      <button
        onClick={togglePlayPause}
        className="px-4 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
        aria-label={isPlaying ? 'Pause video' : 'Play video'}
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <button
        onClick={toggleAudioImposition}
        disabled={!hasAudio}
        className="px-4 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label={isImposedAudio ? 'Remove voice-over' : 'Add voice-over'}
      >
        {isImposedAudio ? 'Remove Voice-over' : 'Add Voice-over'}
      </button>
    </div>
    
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-gray-400">Start:</span>
        <span className="text-white">{timeStart}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-400">End:</span>
        <span className="text-white">{timeEnd}</span>
      </div>
    </div>
  </div>
)

const EmotionsDisplay = ({ emotions }: { emotions: Dialogue['emotions'] }) => (
  <div className="grid grid-cols-2 gap-4">
    <div>
      <span className="text-gray-400">Primary Emotion:</span>
      <p className="text-white">
        {emotions?.primary?.emotion ?? 'Not specified'} 
        {emotions?.primary?.intensity !== undefined && 
          `(Intensity: ${getNumberValue(emotions.primary.intensity)})`
        }
      </p>
    </div>
  </div>
)

const RecordingControls = ({
  isRecording,
  isPlayingRecording,
  startRecording,
  stopRecording,
  handlePlayRecording,
  hasRecording,
  currentIndex,
  totalCount
}: {
  isRecording: boolean,
  isPlayingRecording: boolean,
  startRecording: () => void,
  stopRecording: () => void,
  handlePlayRecording: () => void,
  hasRecording: boolean,
  currentIndex: number,
  totalCount: number
}) => (
  <div className="flex-shrink-0 fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700">
    <div className="flex flex-col items-center py-4 space-y-4">
      <div className="flex items-center space-x-4">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`px-6 py-2 rounded-full ${
            isRecording
              ? 'bg-red-500 hover:bg-red-600'
              : 'bg-blue-500 hover:bg-blue-600'
          } text-white transition-colors`}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>

        {hasRecording && !isRecording && (
          <button
            onClick={handlePlayRecording}
            className={`px-6 py-2 rounded-full ${
              isPlayingRecording
                ? 'bg-yellow-500 hover:bg-yellow-600'
                : 'bg-green-500 hover:bg-green-600'
            } text-white transition-colors`}
            aria-label={isPlayingRecording ? 'Stop playing' : 'Play recording'}
          >
            {isPlayingRecording ? 'Stop Playing' : 'Play Recording'}
          </button>
        )}
      </div>

      <div className="text-sm text-gray-300">
        Dialogue {currentIndex + 1} of {totalCount}
      </div>
    </div>
  </div>
)

// Update the ConfirmationModal interface
interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDiscard: () => void;
  onApprove: () => void;
  isSaving: boolean;
  type: 'navigation' | 'discard';
  direction?: 'next' | 'previous';
}

const ConfirmationModal = ({
  isOpen,
  onClose,
  onDiscard,
  onApprove,
  isSaving,
  type,
  direction
}: ConfirmationModalProps) => {
  if (!isOpen) return null;
  
  const getTitle = () => {
    if (type === 'navigation') {
      return 'Unsaved Changes - Navigation';
    }
    return 'Unsaved Changes';
  };

  const getMessage = () => {
    if (type === 'navigation') {
      return `You have unsaved changes. Would you like to save them before moving to the ${direction} dialogue?`;
    }
    return 'You have unsaved changes. What would you like to do?';
  };

  const getDiscardButtonText = () => {
    if (type === 'navigation') {
      return 'Discard and Continue';
    }
    return 'Delete Recording';
  };

  const getApproveButtonText = () => {
    if (isSaving) return 'Saving...';
    if (type === 'navigation') {
      return 'Save and Continue';
    }
    return 'Save';
  };
  
  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={(e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full">
        <h3 id="modal-title" className="text-lg font-semibold mb-4 text-white">
          {getTitle()}
        </h3>
        <p className="mb-4 text-gray-300">
          {getMessage()}
        </p>
        <div className="flex justify-end space-x-4">
          <button
            onClick={onDiscard}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            disabled={isSaving}
          >
            {getDiscardButtonText()}
          </button>
          <button
            onClick={onApprove}
            disabled={isSaving}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {getApproveButtonText()}
          </button>
        </div>
      </div>
    </div>
  );
};

const Notifications = ({
  isSaving,
  showSaveSuccess,
  error
}: {
  isSaving: boolean,
  showSaveSuccess: boolean,
  error: string
}) => (
  <>
    {isSaving && (
      <div className="fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded shadow-lg z-50" role="alert">
        Approving voice-over...
      </div>
    )}
    
    {showSaveSuccess && (
      <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50" role="alert">
        Voice-over saved successfully!
      </div>
    )}
    
    {error && (
      <div className="fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg z-50" role="alert">
        {error}
      </div>
    )}
  </>
)

const NavigationControls = ({
  onPrevious,
  onNext,
  hasPrevious,
  hasNext
}: {
  onPrevious: () => void,
  onNext: () => void,
  hasPrevious: boolean,
  hasNext: boolean
}) => (
  <div className="flex justify-center gap-4 p-2 bg-gray-800">
    <button
      onClick={onPrevious}
      disabled={!hasPrevious}
      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label="Previous dialogue"
    >
      Previous
    </button>
    <button
      onClick={onNext}
      disabled={!hasNext}
      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label="Next dialogue"
    >
      Next
    </button>
  </div>
)

const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-screen bg-gray-900">
    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white"></div>
  </div>
)

interface ErrorFallbackProps {
  error: AppError;
  resetError: () => void;
}

const ErrorFallback = ({ error, resetError }: ErrorFallbackProps) => (
  <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white p-4">
    <h2 className="text-xl font-bold mb-4">Something went wrong</h2>
    <pre className="bg-gray-800 p-4 rounded mb-4 max-w-lg overflow-auto">
      {error.message}
      {error.code && <div className="text-sm text-gray-400 mt-2">Error code: {error.code}</div>}
      {error.status && <div className="text-sm text-gray-400">Status: {error.status}</div>}
    </pre>
    <button
      onClick={resetError}
      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
    >
      Try again
    </button>
  </div>
)

interface DialogueViewProps {
  dialogues: Dialogue[];
  projectId: string;
}

interface QueryData {
  data: Dialogue[];
  status: string;
  timestamp: number;
}

interface AppError extends Error {
  code?: string;
  status?: number;
}

export default function VoiceOverDialogueView({ dialogues: initialDialogues, projectId }: DialogueViewProps) {
  const [dialoguesList, setDialoguesList] = useState(initialDialogues);
  const [currentDialogueIndex, setCurrentDialogueIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [error, setError] = useState<string>('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [isImposedAudio, setIsImposedAudio] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState<AppError | null>(null);
  const [localAudioBlob, setLocalAudioBlob] = useState<Blob | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const queryClient = useQueryClient();
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const voiceOverSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const dragX = useMotionValue(0);
  const dragControls = useAnimation();
  const [confirmationType, setConfirmationType] = useState<'navigation' | 'discard'>('discard');
  const [navigationDirection, setNavigationDirection] = useState<'next' | 'previous' | undefined>();
  const [pendingNavigationIndex, setPendingNavigationIndex] = useState<number | null>(null);

  const currentDialogue = dialoguesList[currentDialogueIndex];
  const maxDuration = currentDialogue ? calculateDuration(currentDialogue.timeStart, currentDialogue.timeEnd) : 0;

  const {
    audioBlob,
    isRecording,
    recordingDuration,
    isPlayingRecording,
    startRecording,
    stopRecording,
    handlePlayRecording
  } = useAudioRecording(currentDialogue);

  // Update local audio blob when recording changes
  useEffect(() => {
    setLocalAudioBlob(audioBlob);
  }, [audioBlob]);

  // Navigation handlers
  const hasChanges = () => localAudioBlob !== null;

  const handleNext = () => {
    if (hasChanges()) {
      setConfirmationType('navigation');
      setNavigationDirection('next');
      setPendingNavigationIndex(currentDialogueIndex + 1);
      setShowConfirmation(true);
    } else if (currentDialogueIndex < dialoguesList.length - 1) {
      setCurrentDialogueIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentDialogueIndex > 0) {
      if (hasChanges()) {
        setConfirmationType('navigation');
        setNavigationDirection('previous');
        setPendingNavigationIndex(currentDialogueIndex - 1);
        setShowConfirmation(true);
      } else {
        setCurrentDialogueIndex(prev => prev - 1);
      }
    }
  };

  const handleDiscardChanges = () => {
    setShowConfirmation(false);
    if (currentDialogue) {
      setLocalAudioBlob(null);
      if (pendingNavigationIndex !== null) {
        setCurrentDialogueIndex(pendingNavigationIndex);
        setPendingNavigationIndex(null);
      }
    }
    setNavigationDirection(undefined);
  };

  // Video control functions
  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Function to handle audio imposition
  const toggleAudioImposition = async () => {
    if (!videoRef.current) return;

    if (isImposedAudio) {
      // Remove imposed audio
      if (audioSourceRef.current) {
        audioSourceRef.current.disconnect();
        audioSourceRef.current = null;
      }
      if (voiceOverSourceRef.current) {
        voiceOverSourceRef.current.stop();
        voiceOverSourceRef.current = null;
      }
      setIsImposedAudio(false);
      return;
    }

    try {
      // Check browser support
      if (!window.AudioContext) {
        throw new Error('AudioContext is not supported in this browser');
      }

      // Initialize audio context if needed
      if (!audioContextRef.current) {
        try {
          audioContextRef.current = new AudioContext({
            sampleRate: 44100,
            latencyHint: 'interactive'
          });
        } catch (error) {
          console.error('Failed to create AudioContext:', error);
          throw new Error('Failed to initialize audio system');
        }
      }

      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Connect video audio to context
      if (!audioSourceRef.current) {
        try {
          audioSourceRef.current = audioContextRef.current.createMediaElementSource(videoRef.current);
          audioSourceRef.current.connect(audioContextRef.current.destination);
        } catch (error) {
          console.error('Failed to connect audio source:', error);
          throw new Error('Failed to connect audio source');
        }
      }

      // Load and play voice-over audio
      let audioData: ArrayBuffer;
      try {
        if (localAudioBlob) {
          audioData = await localAudioBlob.arrayBuffer();
        } else if (currentDialogue.voiceOverUrl) {
          const response = await fetch(currentDialogue.voiceOverUrl);
          if (!response.ok) {
            throw new Error('Failed to fetch voice-over audio');
          }
          audioData = await response.arrayBuffer();
        } else {
          throw new Error('No audio source available');
        }

        const audioBuffer = await audioContextRef.current.decodeAudioData(audioData);
        if (voiceOverSourceRef.current) {
          voiceOverSourceRef.current.stop();
        }
        
        voiceOverSourceRef.current = audioContextRef.current.createBufferSource();
        voiceOverSourceRef.current.buffer = audioBuffer;
        voiceOverSourceRef.current.connect(audioContextRef.current.destination);
        voiceOverSourceRef.current.start(0, videoRef.current.currentTime);
        
        setIsImposedAudio(true);
      } catch (error) {
        console.error('Failed to process audio:', error);
        throw new Error('Failed to process audio data');
      }
    } catch (err) {
      console.error('Error imposing audio:', err);
      const error = err as AppError;
      setError(error.message || 'Failed to impose audio');
      setIsImposedAudio(false);
    }
  };

  // Save changes with approval
  const handleApproveAndSave = async () => {
    if (!currentDialogue) return;
    
    try {
      setIsSaving(true);
      
      let voiceOverUrl = currentDialogue.voiceOverUrl;
      
      // Upload audio if new recording exists
      if (localAudioBlob) {
        const formData = new FormData();
        formData.append('audio', localAudioBlob);
        formData.append('dialogueId', currentDialogue._id);
        formData.append('dialogueIndex', currentDialogue.index.toString());
        formData.append('projectId', projectId);
        
        const uploadResponse = await fetch('/api/upload-voice-over', {
          method: 'POST',
          body: formData,
        });
        
        if (!uploadResponse.ok) {
          throw new Error('Failed to upload voice-over recording');
        }
        
        const { url } = await uploadResponse.json();
        voiceOverUrl = url;
      }
      
      const updateData = {
        dialogue: currentDialogue.dialogue,
        character: currentDialogue.character,
        status: 'voice-over-added',
        timeStart: currentDialogue.timeStart,
        timeEnd: currentDialogue.timeEnd,
        index: currentDialogue.index,
        voiceOverUrl,
      };
      
      const response = await fetch(`/api/dialogues/${currentDialogue._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to save voice-over');
      }
      
      setDialoguesList(prevDialogues => 
        prevDialogues.map(d => 
          d._id === currentDialogue._id ? responseData : d
        )
      );

      queryClient.setQueryData(['dialogues', projectId], (oldData: QueryData | undefined) => {
        if (!oldData?.data) return oldData;
        return {
          ...oldData,
          data: oldData.data.map((d: Dialogue) => 
            d._id === currentDialogue._id ? responseData : d
          )
        };
      });

      setShowSaveSuccess(true);
      setShowConfirmation(false);
      setLocalAudioBlob(null);
      setTimeout(() => setShowSaveSuccess(false), 2000);

      // Handle navigation after save
      if (pendingNavigationIndex !== null) {
        setCurrentDialogueIndex(pendingNavigationIndex);
        setPendingNavigationIndex(null);
      } else if (currentDialogueIndex < dialoguesList.length - 1) {
        setCurrentDialogueIndex(prev => prev + 1);
      }
    } catch (err) {
      console.error('Error saving voice-over:', err);
      const error = err as AppError;
      setError(error.message || 'Failed to save voice-over');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsSaving(false);
      setNavigationDirection(undefined);
    }
  };

  // Add video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleLoadStart = () => setIsVideoLoading(true);
      const handleLoadEnd = () => setIsVideoLoading(false);

      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('loadstart', handleLoadStart);
      video.addEventListener('canplay', handleLoadEnd);
      video.addEventListener('error', handleLoadEnd);
      
      return () => {
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('loadstart', handleLoadStart);
        video.removeEventListener('canplay', handleLoadEnd);
        video.removeEventListener('error', handleLoadEnd);
      };
    }
  }, [currentDialogue?.videoUrl]);

  // Handle video seeking
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleSeek = () => {
      if (isImposedAudio && voiceOverSourceRef.current) {
        voiceOverSourceRef.current.stop();
        const newSource = audioContextRef.current!.createBufferSource();
        newSource.buffer = voiceOverSourceRef.current.buffer;
        newSource.connect(audioContextRef.current!.destination);
        newSource.start(0, video.currentTime);
        voiceOverSourceRef.current = newSource;
      }
    };

    video.addEventListener('seeked', handleSeek);
    return () => video.removeEventListener('seeked', handleSeek);
  }, [isImposedAudio]);

  // Cleanup audio context
  useEffect(() => {
    return () => {
      voiceOverSourceRef.current?.stop();
      audioContextRef.current?.close();
    };
  }, []);

  // Reset error state
  const resetError = () => {
    setHasError(null);
    setError('');
  };

  // Error boundary
  if (hasError) {
    return <ErrorFallback error={hasError} resetError={resetError} />;
  }

  // Loading state
  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!currentDialogue) {
    return <div className="text-center p-4">No dialogues available.</div>
  }

  const handleDragEnd = async (event: any, info: PanInfo) => {
    const threshold = 100;
    const velocity = info.velocity.x;
    const offset = info.offset.x;

    if (Math.abs(velocity) >= 500 || Math.abs(offset) >= threshold) {
      if (velocity > 0 || offset > threshold) {
        // Swipe right - go to previous
        if (currentDialogueIndex > 0) {
          if (hasChanges()) {
            setConfirmationType('navigation');
            setNavigationDirection('previous');
            setPendingNavigationIndex(currentDialogueIndex - 1);
            setShowConfirmation(true);
          } else {
            setCurrentDialogueIndex(prev => prev - 1);
          }
        }
      } else {
        // Swipe left - go to next
        if (currentDialogueIndex < dialoguesList.length - 1) {
          if (hasChanges()) {
            setConfirmationType('navigation');
            setNavigationDirection('next');
            setPendingNavigationIndex(currentDialogueIndex + 1);
            setShowConfirmation(true);
          } else {
            setCurrentDialogueIndex(prev => prev + 1);
          }
        }
      }
    }
    
    await dragControls.start({ x: 0 });
  };

  return (
    <div className="w-full h-screen flex flex-col bg-gray-900">
      <CharacterInfo character={currentDialogue.character} />
      
      <NavigationControls 
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={currentDialogueIndex > 0}
        hasNext={currentDialogueIndex < dialoguesList.length - 1}
      />
      
      <VideoPlayer 
        videoRef={videoRef}
        videoUrl={currentDialogue.videoUrl}
        isVideoLoading={isVideoLoading}
      />
      
      <VideoControls 
        isPlaying={isPlaying}
        togglePlayPause={togglePlayPause}
        toggleAudioImposition={toggleAudioImposition}
        isImposedAudio={isImposedAudio}
        hasAudio={!!localAudioBlob || !!currentDialogue.voiceOverUrl}
        timeStart={currentDialogue.timeStart}
        timeEnd={currentDialogue.timeEnd}
      />

      <motion.div 
        className="flex-grow overflow-y-auto p-4"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        animate={dragControls}
        style={{ x: dragX }}
      >
        <EmotionsDisplay emotions={currentDialogue.emotions} />
        
        <div className="mt-4">
          <span className="text-gray-400">Adapted Text:</span>
          <p className="text-white">{currentDialogue.dialogue.adapted}</p>
        </div>

        <div className="flex flex-col items-center justify-center text-sm text-gray-400 space-y-2 mt-4">
          <span>Recording duration limit: {formatTime(maxDuration)}</span>
          {isRecording && (
            <span>Recording time: {formatTime(recordingDuration)}</span>
          )}
        </div>
      </motion.div>

      <RecordingControls 
        isRecording={isRecording}
        isPlayingRecording={isPlayingRecording}
        startRecording={startRecording}
        stopRecording={stopRecording}
        handlePlayRecording={handlePlayRecording}
        hasRecording={!!localAudioBlob}
        currentIndex={currentDialogueIndex}
        totalCount={dialoguesList.length}
      />

      <ConfirmationModal 
        isOpen={showConfirmation}
        onClose={() => {
          setShowConfirmation(false);
          setPendingNavigationIndex(null);
          setNavigationDirection(undefined);
        }}
        onDiscard={handleDiscardChanges}
        onApprove={handleApproveAndSave}
        isSaving={isSaving}
        type={confirmationType}
        direction={navigationDirection}
      />

      <Notifications 
        isSaving={isSaving}
        showSaveSuccess={showSaveSuccess}
        error={error}
      />

      <div className="h-24"></div>
    </div>
  );
} 