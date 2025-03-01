// VoiceOverDialougeView.tsx

import React, { useState, useRef, useEffect, useCallback, useMemo, startTransition } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, useMotionValue, useAnimation, type PanInfo } from 'framer-motion'
import { type Dialogue } from '@/types/dialogue'
import { type Episode, type Project } from '@/types/project'
import { formatTime, getNumberValue, calculateDuration } from '@/utils/formatters'
import { useAudioRecording } from '@/hooks/useAudioRecording'
import axios from 'axios'
import AudioVisualizer from './AudioVisualizer'
import RecordingTimer from './RecordingTimer'
import { useCacheCleaner } from '@/hooks/useCacheCleaner'
import { logEvent } from '@/utils/analytics'
import { debounce } from 'lodash'
import { Profiler } from 'react'

// Add new type for recording status
type RecordingStatus = 'available' | 'unavailable' | 'checking';

// Sub-components
const CharacterInfo = React.memo(({ 
  character, 
  voiceOverUrl 
}: { 
  character: string;
  voiceOverUrl?: string;
}) => {
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('checking');

  useEffect(() => {
    const checkRecordingStatus = async () => {
      if (!voiceOverUrl) {
        setRecordingStatus('unavailable');
        return;
      }

      try {
        await axios.head(voiceOverUrl);
        setRecordingStatus('available');
      } catch (error) {
        console.error('Error checking recording status:', error);
        setRecordingStatus('unavailable');
      }
    };

    checkRecordingStatus();
  }, [voiceOverUrl]);

  return (
    <div className="p-2 bg-gray-800">
      <div className="flex items-center justify-center gap-2">
        <span className="text-gray-400">Character:</span>
        <div className="flex items-center gap-2">
          <span className="text-white">{character}</span>
          <div 
            className={`w-3 h-3 rounded-full ${
              recordingStatus === 'checking' 
                ? 'bg-yellow-500 animate-pulse'
                : recordingStatus === 'available'
                ? 'bg-green-500'
                : 'bg-red-500'
            }`}
            title={
              recordingStatus === 'checking'
                ? 'Checking recording status...'
                : recordingStatus === 'available'
                ? 'Recording available'
                : 'Recording not available'
            }
          />
        </div>
      </div>
    </div>
  );
});

CharacterInfo.displayName = 'CharacterInfo';

const VideoPlayer = React.memo(({ 
  videoRef, 
  videoClipUrl,
  isVideoLoading 
}: { 
  videoRef: React.RefObject<HTMLVideoElement>,
  videoClipUrl: string,
  isVideoLoading: boolean
}) => (
  <div className="relative">
    <video
      ref={videoRef}
      src={videoClipUrl}
      className="w-full aspect-video max-h-[200px] object-contain bg-black"
      aria-label="Dialogue video player"
    />
    {isVideoLoading && (
      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
      </div>
    )}
  </div>
));

VideoPlayer.displayName = 'VideoPlayer';

const VideoControls = React.memo(({
  isPlaying,
  togglePlayPause,
  handleSyncedPlayback,
  isSyncedPlaying,
  hasRecording,
  audioDuration,
  videoDuration,
}: {
  isPlaying: boolean,
  togglePlayPause: () => void,
  handleSyncedPlayback: () => void,
  isSyncedPlaying: boolean,
  hasRecording: boolean,
  audioDuration: number,
  videoDuration: number,
}) => {
  const durationMatches = Math.abs(audioDuration - videoDuration) < 0.1; // Allow 100ms tolerance

  return (
    <div className="p-2 bg-gray-800 flex flex-col items-center gap-2">
      <div className="flex gap-2 items-center">
        <button
          onClick={togglePlayPause}
          className="px-4 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
          aria-label={isPlaying ? 'Pause video' : 'Play video'}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        {hasRecording && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncedPlayback}
              className="px-4 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm"
              aria-label={isSyncedPlaying ? 'Stop synced playback' : 'Play with audio'}
            >
              {isSyncedPlaying ? 'Stop Synced' : 'Play with Audio'}
            </button>
            <div 
              className={`w-3 h-3 rounded-full ${durationMatches ? 'bg-green-500' : 'bg-red-500'}`}
              title={durationMatches 
                ? 'Audio and video durations match' 
                : `Duration mismatch - Video: ${videoDuration.toFixed(3)}s, Audio: ${audioDuration.toFixed(3)}s`}
            />
          </div>
        )}
      </div>
    </div>
  );
});

VideoControls.displayName = 'VideoControls';

const EmotionsDisplay = React.memo(({ emotions }: { emotions: Dialogue['emotions'] }) => (
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
));

EmotionsDisplay.displayName = 'EmotionsDisplay';

const RecordingControls = React.memo(({
  isRecording,
  isPlayingRecording,
  startRecording,
  stopRecording,
  handlePlayRecording,
  hasRecording,
  hasExistingRecording,
  currentIndex,
  totalCount,
  onReRecord,
  onDelete,
  localAudioBlob,
  isProcessing,
  countdown,
  isWaitingForVoice,
  currentDialogue
}: {
  isRecording: boolean,
  isPlayingRecording: boolean,
  startRecording: () => Promise<void>,
  stopRecording: () => void,
  handlePlayRecording: () => void,
  hasRecording: boolean,
  hasExistingRecording: boolean,
  currentIndex: number,
  totalCount: number,
  onReRecord: () => void,
  onDelete: () => void,
  localAudioBlob: Blob | null,
  isProcessing: boolean,
  countdown: number,
  isWaitingForVoice: boolean,
  currentDialogue: Dialogue
}) => {
  const handleStartRecording = async () => {
    if (isProcessing) return;
    
    try {
      await startRecording();
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const handleStopRecording = () => {
    try {
      stopRecording();
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  return (
    <div className="flex-shrink-0 fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700">
      <div className="flex flex-col items-center py-4 space-y-4">
        <div className="flex items-center space-x-4">
          {!isRecording && !localAudioBlob && currentDialogue?.voiceOverUrl && (
            <button
              onClick={onReRecord}
              className="px-6 py-2 rounded-full bg-purple-500 hover:bg-purple-600 text-white transition-colors"
              aria-label="Re-record audio"
              title="Record a new version to replace existing audio"
              disabled={isProcessing}
            >
              Re-Record
            </button>
          )}

          {(!hasExistingRecording || isRecording || localAudioBlob) && (
            <button
              onClick={isRecording ? handleStopRecording : handleStartRecording}
              className={`px-6 py-2 rounded-full ${
                isRecording
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-blue-500 hover:bg-blue-600'
              } text-white transition-colors`}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              disabled={isProcessing}
            >
              {isProcessing && countdown > 0 ? (
                <span className="flex items-center">
                  <span className="text-lg font-bold mr-2">{countdown}</span>
                  Starting...
                </span>
              ) : isWaitingForVoice ? (
                <span className="flex items-center">
                  <span className="animate-pulse">Waiting for voice...</span>
                </span>
              ) : isRecording ? (
                'Stop Recording'
              ) : (
                'Start Recording'
              )}
            </button>
          )}

          {!isRecording && hasRecording && (
            <button
              onClick={handlePlayRecording}
              className={`px-6 py-2 rounded-full ${
                isPlayingRecording
                  ? 'bg-yellow-500 hover:bg-yellow-600'
                  : 'bg-green-500 hover:bg-green-600'
              } text-white transition-colors`}
              aria-label={isPlayingRecording ? 'Stop playing' : 'Play recorded audio'}
              title={isPlayingRecording ? 'Stop current playback' : 'Play recorded audio'}
              disabled={isProcessing}
            >
              {isPlayingRecording ? 'Stop Playing' : 'Play Recorded Audio'}
            </button>
          )}
        </div>

        <div className="text-sm text-gray-300">
          Dialogue {currentIndex + 1} of {totalCount}
        </div>
      </div>
    </div>
  );
});

RecordingControls.displayName = 'RecordingControls';

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
  episode?: Episode;
  project?: Project;
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

// Add helper function to extract scene number
const extractSceneNumber = (dialogueNumber: string): string => {
  const parts = dialogueNumber.split('.');
  if (parts.length >= 3) {
    return parts.slice(0, -1).join('.');
  }
  return '';
};

// Add new function for noise reduction
const processAudioWithNoiseReduction = async (audioBlob: Blob): Promise<Blob> => {
  try {
    logEvent('Starting noise reduction process', {
      originalBlobSize: audioBlob.size,
      originalBlobType: audioBlob.type,
      timestamp: new Date().toISOString()
    });

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.wav');

    // Use our proxy API route instead of calling the service directly
    const response = await axios.post(
      '/api/noise-reduction',
      formData,
      {
        headers: { 
          'Content-Type': 'multipart/form-data',
        },
        responseType: 'blob',
        timeout: 60000,
      }
    );

    logEvent('Noise reduction completed', {
      processedBlobSize: response.data.size,
      processedBlobType: response.data.type,
      status: response.status,
      timestamp: new Date().toISOString()
    });

    return new Blob([response.data], { type: 'audio/wav' });
  } catch (error: any) {
    logEvent('Noise reduction failed', {
      error: error.message,
      status: error.response?.status,
      responseData: error.response?.data,
      timestamp: new Date().toISOString()
    }, 'error');
    
    logEvent('Falling back to original audio', {
      timestamp: new Date().toISOString()
    }, 'warn');
    return audioBlob;
  }
};

// Add debounced logging helper at the top level
const debouncedLogEvent = debounce((event: string, data: any) => {
  logEvent(event, data);
}, 300);

export default function VoiceOverDialogueView({ dialogues: initialDialogues, projectId, episode, project }: DialogueViewProps) {
  // Initialize cache cleaner
  useCacheCleaner();
  // console.log('initialDialogues', initialDialogues);

  // Memoize sortedDialogues to prevent unnecessary recalculation
  // const sortedDialogues = useMemo(() => 
  //   [...initialDialogues].sort((a, b) => 
  //     (a.subtitleIndex ?? 0) - (b.subtitleIndex ?? 0)
  //   ), [initialDialogues]
  // );

  const sortedDialogues = initialDialogues;

  
  const [dialoguesList, setDialoguesList] = useState(sortedDialogues);
  const [currentDialogueIndex, setCurrentDialogueIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [error, setError] = useState<string>('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [localAudioBlob, setLocalAudioBlob] = useState<Blob | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const queryClient = useQueryClient();
  const [isPlaying, setIsPlaying] = useState(false);
  const dragX = useMotionValue(0);
  const dragControls = useAnimation();
  const [confirmationType, setConfirmationType] = useState<'navigation' | 'discard'>('discard');
  const [navigationDirection, setNavigationDirection] = useState<'next' | 'previous' | undefined>();
  const [pendingNavigationIndex, setPendingNavigationIndex] = useState<number | null>(null);
  const [isSyncedPlaying, setIsSyncedPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [maxDuration, setMaxDuration] = useState(0);
  const [currentRecordingDuration, setCurrentRecordingDuration] = useState(0);

  // Memoize currentDialogue to prevent unnecessary recalculations
  const currentDialogue = useMemo(() => 
    dialoguesList[currentDialogueIndex],
    [dialoguesList, currentDialogueIndex]
  );

  // Update dialoguesList only when sortedDialogues changes
  useEffect(() => {
    setDialoguesList(sortedDialogues);
  }, [sortedDialogues]);

  // Log only on mount and when dialogues actually change
  useEffect(() => {
    const dialoguesCount = initialDialogues.length;
    logEvent('Component initialized', {
      totalDialogues: dialoguesCount,
      projectId,
      episodeId: episode?._id,
      projectTitle: project?.title
    });
  }, [projectId, episode?._id, project?.title, initialDialogues.length]);

  const {
    audioBlob,
    isRecording,
    recordingDuration,
    isPlayingRecording,
    startRecording,
    stopRecording,
    handlePlayRecording,
    setPlayingState,
    isProcessing,
    countdown,
    isWaitingForVoice,
    audioStream
  } = useAudioRecording(currentDialogue);

  // Add audio player ref for remote audio
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Move function declarations to the top
  const updateAudioDuration = useCallback(async (audioUrl: string) => {
    if (!audioUrl) return;

    try {
      const audio = new Audio();
      audio.src = audioUrl;

      const duration = await new Promise<number>((resolve, reject) => {
        const handleLoad = () => {
          const duration = audio.duration;
          cleanup();
          resolve(duration);
        };

        const handleError = () => {
          cleanup();
          reject(new Error('Failed to load audio'));
        };

        const cleanup = () => {
          audio.removeEventListener('loadedmetadata', handleLoad);
          audio.removeEventListener('error', handleError);
        };

        audio.addEventListener('loadedmetadata', handleLoad);
        audio.addEventListener('error', handleError);
      });

      startTransition(() => {
        setAudioDuration(duration);
      });
    } catch (error) {
      console.error('Error getting audio duration:', error);
      startTransition(() => {
        setAudioDuration(0);
      });
    }
  }, []);

  const cleanupAudioStates = useCallback(() => {
    // Stop and cleanup audio elements first
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // Use a single React batch update
    React.startTransition(() => {
      setIsPlaying(false);
      setIsSyncedPlaying(false);
      setLocalAudioBlob(null);
      setPlayingState(false);
      setAudioDuration(0);
    });
  }, [setPlayingState]);

  // Function to handle playing remote audio
  const handlePlayRemoteAudio = useCallback(() => {
    if (!currentDialogue?.voiceOverUrl) return;

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
      setPlayingState(false);
      return;
    }

    const audio = new Audio(currentDialogue.voiceOverUrl);
    audioPlayerRef.current = audio;

    audio.addEventListener('ended', () => {
      setPlayingState(false);
      audioPlayerRef.current = null;
    });

    audio.addEventListener('error', () => {
      setPlayingState(false);
      audioPlayerRef.current = null;
      setError('Failed to play audio');
    });

    audio.play().then(() => {
      setPlayingState(true);
    }).catch(error => {
      console.error('Failed to play audio:', error);
      setError('Failed to play audio');
      audioPlayerRef.current = null;
    });
  }, [currentDialogue?.voiceOverUrl, setPlayingState]);

  // Combined play function
  const handlePlayAudio = useCallback(() => {
    if (localAudioBlob) {
      handlePlayRecording();
    } else if (currentDialogue?.voiceOverUrl) {
      handlePlayRemoteAudio();
    }
  }, [localAudioBlob, currentDialogue?.voiceOverUrl, handlePlayRecording, handlePlayRemoteAudio]);

  // Cleanup audio on unmount or dialogue change
  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, [currentDialogue?._id]);

  // Update local audio blob when recording changes
  useEffect(() => {
    setLocalAudioBlob(audioBlob);
  }, [audioBlob]);

  // Navigation handlers
  const hasChanges = useCallback(() => {
    return localAudioBlob !== null;
  }, [localAudioBlob]);

  const handleNext = useCallback(() => {
    if (hasChanges()) {
      setConfirmationType('navigation');
      setNavigationDirection('next');
      setPendingNavigationIndex(currentDialogueIndex + 1);
      setShowConfirmation(true);
    } else if (currentDialogueIndex < dialoguesList.length - 1) {
      setCurrentDialogueIndex(prev => prev + 1);
    }
  }, [currentDialogueIndex, dialoguesList.length, hasChanges, setConfirmationType, setNavigationDirection, setPendingNavigationIndex, setShowConfirmation]);

  const handlePrevious = useCallback(() => {
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
  }, [currentDialogueIndex, hasChanges]);

  const handleDeleteRecording = async () => {
    if (!currentDialogue) return;

    const sceneNumber = extractSceneNumber(currentDialogue.dialogNumber);
    if (!sceneNumber) {
      setError('Invalid scene number format');
      return;
    }

    try {
      setIsSaving(true);
      logEvent('Deleting voice-over recording', { 
        dialogueId: currentDialogue.dialogNumber,
        sceneNumber 
      });

      const updateData = {
        dialogue: currentDialogue.dialogue,
        character: currentDialogue.characterName,
        timeStart: currentDialogue.timeStart,
        timeEnd: currentDialogue.timeEnd,
        index: currentDialogue.subtitleIndex,
        deleteVoiceOver: true,
        sceneNumber
      };

      const response = await axios.put(`/api/dialogues/${sceneNumber}/${currentDialogue.dialogNumber}`, updateData);

      if (!response.data || !response.data._id) {
        throw new Error('Failed to delete recording: Invalid response');
      }

      // Update local state
      const updatedDialogues = dialoguesList.map(dialogue => 
        dialogue._id === currentDialogue.dialogNumber 
          ? { ...dialogue, voiceOverUrl: undefined, status: 'pending' }
          : dialogue
      ).sort((a, b) => (a.subtitleIndex ?? 0) - (b.subtitleIndex ?? 0));
      setDialoguesList(updatedDialogues);

      // Clear local audio blob
      setLocalAudioBlob(null);

      // Show success message
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 3000);

      // Invalidate queries to refetch data
      await queryClient.invalidateQueries({ queryKey: ['dialogues', projectId] });

      logEvent('Voice-over recording deleted successfully', { dialogueId: currentDialogue.dialogNumber });
    } catch (error) {
      console.error('Error deleting recording:', error);
      setError('Failed to delete recording');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardChanges = async () => {
    try {
      cleanupAudioStates();

      if (confirmationType === 'navigation') {
        if (pendingNavigationIndex !== null) {
          setCurrentDialogueIndex(pendingNavigationIndex);
          setPendingNavigationIndex(null);
        }
      } else {
        await handleDeleteRecording();
      }

      setShowConfirmation(false);
      setNavigationDirection(undefined);
    } catch (error) {
      console.error('Error discarding changes:', error);
      setError('Failed to delete recording');
      setTimeout(() => setError(''), 3000);
    }
  };

  // Video control functions
  const togglePlayPause = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

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
  }, [currentDialogue?.videoClipUrl]);

  // First, combine the duplicate useEffect for maxDuration and currentIndex
  useEffect(() => {
    if (!currentDialogue || !dialoguesList.length) return;
    
    // Update maxDuration based on current dialogue
    const duration = calculateDuration(currentDialogue.timeStart, currentDialogue.timeEnd);
    setMaxDuration(duration);
    
    // Only update index if it's different
    const index = dialoguesList.findIndex(d => d._id === currentDialogue.dialogNumber);
    if (index !== -1 && index !== currentDialogueIndex) {
      setCurrentDialogueIndex(index);
    }
  }, [currentDialogue, dialoguesList, calculateDuration]); // Remove currentDialogueIndex from deps

  // Update the dialogue change effect
  useEffect(() => {
    if (!currentDialogue?._id) return;

    let isMounted = true;

    const updateDialogue = async () => {
      if (!isMounted) return;

      // Only update audio duration if we have a voiceOver URL
      if (currentDialogue.voiceOverUrl) {
        try {
          await updateAudioDuration(currentDialogue.voiceOverUrl);
        } catch (error) {
          console.error('Failed to update audio duration:', error);
        }
      }

      // Log the dialogue change
      debouncedLogEvent('Current dialogue changed', {
        dialogueId: currentDialogue.dialogNumber,
        dialogueNumber: currentDialogue.dialogNumber,
        characterName: currentDialogue.characterName,
        hasVoiceOver: !!currentDialogue.voiceOverUrl,
        timeStart: currentDialogue.timeStart,
        timeEnd: currentDialogue.timeEnd,
        index: currentDialogueIndex,
        total: dialoguesList.length
      });
    };

    updateDialogue();

    // Cleanup function
    return () => {
      isMounted = false;
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      debouncedLogEvent.cancel();
    };
  }, [currentDialogue?._id, updateAudioDuration, debouncedLogEvent]);

  // Update the audio blob state effect
  useEffect(() => {
    const hasLocalBlob = !!localAudioBlob;
    const hasExistingRecording = !!currentDialogue?.voiceOverUrl;
    
    if (hasLocalBlob || hasExistingRecording) {
      logEvent('Audio blob state changed:', {
        hasLocalBlob,
        localBlobSize: localAudioBlob?.size,
        hasExistingRecording
      });
    }
  }, [localAudioBlob, currentDialogue?.voiceOverUrl]); // Keep minimal dependencies

  // Remove duplicate useEffect for recording duration
  useEffect(() => {
    if (currentDialogue?._id && recordingDuration) {
      setCurrentRecordingDuration(recordingDuration);
      
      // Store in localStorage if needed
      if (maxDuration) {
        const key = `recording_duration_${currentDialogue.dialogNumber}`;
        localStorage.setItem(key, recordingDuration.toString());
      }
    }
  }, [currentDialogue?._id, recordingDuration, maxDuration]);

  // Add function to handle synced playback
  const handleSyncedPlayback = useCallback(() => {
    if (isSyncedPlaying) {
      // Stop both video and audio
      if (videoRef.current) {
        videoRef.current.pause();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsSyncedPlaying(false);
      setIsPlaying(false);
      return;
    }
    
    const playSync = async () => {
      try {
        if (!videoRef.current) return;

        // Create audio element
        const audio = new Audio();
      if (localAudioBlob) {
          audio.src = URL.createObjectURL(localAudioBlob);
        } else if (currentDialogue?.voiceOverUrl) {
          audio.src = currentDialogue.voiceOverUrl;
        } else {
          return;
        }

        audioRef.current = audio;

        // Set up cleanup on audio end
        audio.addEventListener('ended', () => {
          setIsSyncedPlaying(false);
          setIsPlaying(false);
          if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.muted = false; // Restore video audio
          }
          URL.revokeObjectURL(audio.src);
          audioRef.current = null;
        });

        // Mute video audio
        videoRef.current.muted = true;

        // Start playback
        videoRef.current.currentTime = 0;
        await Promise.all([
          videoRef.current.play(),
          audio.play()
        ]);

        setIsSyncedPlaying(true);
        setIsPlaying(true);
      } catch (error) {
        console.error('Failed to start synced playback:', error);
        setIsSyncedPlaying(false);
        setIsPlaying(false);
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.muted = false; // Restore video audio on error
        }
      }
    };

    playSync();
  }, [localAudioBlob, currentDialogue?.voiceOverUrl, isSyncedPlaying]);

  // Add cleanup for synced playback
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [currentDialogue?._id]);

  // Add recording state logging
  useEffect(() => {
    if (isRecording) {
      logEvent('Recording started', {
        dialogueId: currentDialogue?._id,
        maxDuration,
        dialogueIndex: currentDialogueIndex + 1,
        totalDialogues: dialoguesList.length
      });
    }
  }, [isRecording, currentDialogue?._id, maxDuration, currentDialogueIndex, dialoguesList.length]);

  // Add audio blob logging
  useEffect(() => {
    if (localAudioBlob) {
      logEvent('New recording created', {
        dialogueId: currentDialogue?._id,
        blobSize: localAudioBlob.size,
        blobType: localAudioBlob.type,
        duration: recordingDuration
      });
    }
  }, [localAudioBlob, currentDialogue?._id, recordingDuration]);

  // Add cleanup effect for dialogue changes
  useEffect(() => {
    // Clean up audio when switching dialogues
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    
    // Reset states
    setIsPlaying(false);
    setLocalAudioBlob(null);
    
    return () => {
      // Cleanup on unmount
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, [currentDialogue?._id]);

  // Update handleApproveAndSave to include processing and dual upload
  const handleApproveAndSave = async () => {
    // Initial validation
    if (!currentDialogue?.dialogNumber || !currentDialogue?.characterName) {
      logEvent('Missing required dialogue data', {
        dialogNumber: currentDialogue?.dialogNumber,
        characterName: currentDialogue?.characterName
      }, 'error');
      setError('Missing required dialogue information');
      return;
    }

    try {
      setIsSaving(true);

      if (!localAudioBlob) {
        setError('No audio recording to save');
        return;
      }

      // Log initial state for debugging
      logEvent('Starting save process', {
        dialogueNumber: currentDialogue.dialogNumber,
        characterName: currentDialogue.characterName,
        audioSize: localAudioBlob.size
      });

      try {
        // Process audio with noise reduction
        const noiseReductionFormData = new FormData();
        noiseReductionFormData.append('file', localAudioBlob, 'audio.wav');

        const processedAudioResponse = await axios.post(
          '/api/noise-reduction',
          noiseReductionFormData,
          {
            headers: { 'Content-Type': 'multipart/form-data' },
            responseType: 'blob'
          }
        );

        // Create form data with explicit string conversions
        const uploadFormData = new FormData();

        // Add audio files
        uploadFormData.append('originalAudio', new Blob([localAudioBlob], { type: 'audio/wav' }), 'original.wav');
        uploadFormData.append('processedAudio', new Blob([processedAudioResponse.data], { type: 'audio/wav' }), 'processed.wav');

        // Add required metadata with explicit string conversion
        const metadata = {
          dialogueId: String(currentDialogue.dialogNumber),
          dialogNumber: String(currentDialogue.dialogNumber),
          projectId: String(projectId),
          sceneNumber: String(extractSceneNumber(currentDialogue.dialogNumber)),
          characterName: String(currentDialogue.characterName)
        };

        // Validate and add metadata to form
        Object.entries(metadata).forEach(([key, value]) => {
          if (!value) {
            throw new Error(`Missing required field: ${key}`);
          }
          uploadFormData.append(key, value);
        });

        // Log form data for verification with proper typing
        interface FormDataLogEntry {
          type?: string;
          size?: number;
          value?: string;
        }

        const formDataLog: Record<string, FormDataLogEntry | string> = {};
        
        // Use Array.from to properly handle FormData iteration
        Array.from(uploadFormData.entries()).forEach(([key, value]) => {
          if (value instanceof Blob) {
            formDataLog[key] = {
              type: value.type,
              size: value.size
            };
          } else {
            formDataLog[key] = String(value);
          }
        });

        logEvent('Upload form data', formDataLog);

        // Make the upload request
        const uploadResponse = await axios.post('/api/voice-over/upload-both', uploadFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          validateStatus: null,
          timeout: 30000
        });

        // Check response status
        if (uploadResponse.status !== 200) {
          throw new Error(`Upload failed: ${JSON.stringify(uploadResponse.data)}`);
        }

        if (!uploadResponse.data?.processedUrl) {
          throw new Error('Upload response missing processedUrl');
        }

        // Handle success
        const voiceOverUrl = uploadResponse.data.processedUrl;
        
        // Update local state
        setDialoguesList(prevList => {
          const newList = [...prevList];
          const dialogueIndex = newList.findIndex(d => d._id === currentDialogue._id);
          if (dialogueIndex !== -1) {
            newList[dialogueIndex] = {
              ...newList[dialogueIndex],
              voiceOverUrl,
              status: 'completed'
            };
          }
          return newList;
        });

        // Cleanup and show success
        setLocalAudioBlob(null);
        setPlayingState(false);
        cleanupAudioStates();
        setShowSaveSuccess(true);
        setTimeout(() => setShowSaveSuccess(false), 3000);
        setShowConfirmation(false);

        // Invalidate queries
        await queryClient.invalidateQueries({ queryKey: ['dialogues', projectId] });

        // Handle navigation
        if (pendingNavigationIndex !== null) {
          setCurrentDialogueIndex(pendingNavigationIndex);
          setPendingNavigationIndex(null);
        }

      } catch (uploadError: any) {
        // Enhanced error logging
        logEvent('Upload error details', {
          error: uploadError.message,
          response: uploadError.response?.data,
          status: uploadError.response?.status,
          dialogueId: currentDialogue.dialogNumber,
          characterName: currentDialogue.characterName
        }, 'error');

        throw new Error(`Upload failed: ${uploadError.response?.data?.message || uploadError.message}`);
      }
    } catch (error: any) {
      console.error('Error saving voice-over:', error);
      setError(error.message || 'Failed to save voice-over');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsSaving(false);
      setNavigationDirection(undefined);
    }
  };

  const handleDragEnd = async (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo): Promise<void> => {
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
            // Clean up audio states before navigation
            cleanupAudioStates();
            setCurrentDialogueIndex(prev => prev - 1);
          }
        }
      } else {
        // Swipe left - go to next
        if (currentDialogueIndex < dialoguesList.length - 1) {
          if (localAudioBlob) {
            setConfirmationType('navigation');
            setNavigationDirection('next');
            setPendingNavigationIndex(currentDialogueIndex + 1);
            setShowConfirmation(true);
          } else {
            // Clean up audio states before navigation
            cleanupAudioStates();
            setCurrentDialogueIndex(prev => prev + 1);
          }
        }
      }
    }
    
    await dragControls.start({ x: 0 });
  };

  const handleReRecord = useCallback(() => {
    try {
      logEvent('Re-record button clicked', {
        dialogueId: currentDialogue?._id,
        existingUrl: currentDialogue?.voiceOverUrl
      });

      // Clear the local audio blob first
    setLocalAudioBlob(null);
    
      // Reset recording states
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      setPlayingState(false);
      
      // Start new recording directly instead of showing confirmation
      startRecording().catch(error => {
        console.error('Failed to start recording:', error);
        setError('Failed to start recording');
      });

      } catch (error) {
      console.error('Failed to handle re-record:', error);
      setError('Failed to start re-recording');
    }
  }, [currentDialogue, startRecording, setPlayingState, setError]);

  const ComponentContent = (
    <div className="w-full h-screen flex flex-col bg-gray-900">
      <CharacterInfo 
        character={currentDialogue.characterName} 
        voiceOverUrl={currentDialogue.voiceOverUrl}
      />
      
      <VideoPlayer 
        videoRef={videoRef}
        videoClipUrl={currentDialogue.videoClipUrl}
        isVideoLoading={isVideoLoading}
      />
      
      <VideoControls 
        isPlaying={isPlaying}
        togglePlayPause={togglePlayPause}
        handleSyncedPlayback={handleSyncedPlayback}
        isSyncedPlaying={isSyncedPlaying}
        hasRecording={!!localAudioBlob || !!currentDialogue?.voiceOverUrl}
        audioDuration={audioDuration}
        videoDuration={maxDuration}
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

        {isRecording && audioStream && (
          <div className="mt-4 space-y-4">
            <AudioVisualizer
              audioStream={audioStream}
              maxDuration={maxDuration}
            />
            <RecordingTimer
              isRecording={isRecording}
              maxDuration={maxDuration}
            />
          </div>
        )}

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
        handlePlayRecording={handlePlayAudio}
        hasRecording={!!localAudioBlob || !!currentDialogue?.voiceOverUrl}
        hasExistingRecording={!!currentDialogue?.voiceOverUrl}
        currentIndex={currentDialogueIndex}
        totalCount={dialoguesList.length}
        onReRecord={handleReRecord}
        onDelete={handleDeleteRecording}
        localAudioBlob={localAudioBlob}
        isProcessing={isProcessing}
        countdown={countdown}
        isWaitingForVoice={isWaitingForVoice}
        currentDialogue={currentDialogue}
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
    </div>
  );

  return process.env.NODE_ENV === 'development' ? (
    <Profiler id="VoiceOverDialogueView" onRender={(id, phase, actualDuration) => {
      console.debug(`[Profiler] ${id} - ${phase} took ${actualDuration}ms`);
    }}>
      {ComponentContent}
    </Profiler>
  ) : ComponentContent;
} 