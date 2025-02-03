import { useState, useRef, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, useMotionValue, useTransform, useAnimation, type PanInfo } from 'framer-motion'
import axios from 'axios'

interface Dialogue {
  _id: string
  index: number
  timeStart: string
  timeEnd: string
  character: string
  videoUrl: string
  projectId?: string
  episodeId?: string
  collectionName?: string
  uploadedAt?: string | Date
  dialogue: {
    original: string
    translated: string
    adapted: string
  }
  status: string
}

interface Episode {
  _id: string
  name: string
  collectionName?: string
  videoPath?: string
  videoKey?: string
  status: 'uploaded' | 'processing' | 'error'
  uploadedAt?: string | Date
  step?: 1 | 2 | 3
  cleanedSpeechPath?: string
  cleanedSpeechKey?: string
  musicAndSoundEffectsPath?: string
  musicAndSoundEffectsKey?: string
}

interface DialogueViewProps {
  dialogues: Dialogue[]
  projectId: string
  episodes: Episode[]
  currentEpisodeId?: string
}

type QueryData = {
  data: Dialogue[];
  status: string;
  timestamp: number;
};

export default function TranscriberDialogueView({ 
  dialogues: initialDialogues, 
  projectId,
  episodes,
  currentEpisodeId 
}: DialogueViewProps) {
  // State declarations
  const [dialoguesList, setDialoguesList] = useState<Dialogue[]>(initialDialogues);
  const [currentDialogueIndex, setCurrentDialogueIndex] = useState(0);
  const [currentDialogue, setCurrentDialogue] = useState<Dialogue | null>(dialoguesList[0] || null);
  const [character, setCharacter] = useState('');
  const [pendingOriginalText, setPendingOriginalText] = useState('');
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [networkStatus, setNetworkStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  // Refs and motion hooks
  const videoRef = useRef<HTMLVideoElement>(null);
  const queryClient = useQueryClient();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-90, 90], [-10, 10]);
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0.5, 1, 1, 1, 0.5]);
  const scale = useTransform(x, [-200, -150, 0, 150, 200], [0.8, 0.9, 1, 0.9, 0.8]);
  const animControls = useAnimation();

  // Constants
  const AUTO_SAVE_DELAY = 30000; // 30 seconds

  // Update current dialogue when index changes
  useEffect(() => {
    const dialogue = dialoguesList[currentDialogueIndex];
    if (dialogue) {
      setCurrentDialogue(dialogue);
      setCharacter(dialogue.character || '');
      setPendingOriginalText(dialogue.dialogue.original || '');
      setTimeStart(dialogue.timeStart);
      setTimeEnd(dialogue.timeEnd);
    }
  }, [currentDialogueIndex, dialoguesList]);

  // Navigation handlers
  const handleNext = useCallback(() => {
    if (currentDialogueIndex < dialoguesList.length - 1) {
      setCurrentDialogueIndex(prev => prev + 1);
    }
  }, [currentDialogueIndex, dialoguesList.length]);

  const handlePrevious = useCallback(() => {
    if (currentDialogueIndex > 0) {
      setCurrentDialogueIndex(prev => prev - 1);
    }
  }, [currentDialogueIndex]);

  // Video control handlers
  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  // Check for unsaved changes
  const hasChanges = useCallback(() => {
    if (!currentDialogue) return false;
    
    return (
      character !== currentDialogue.character ||
      pendingOriginalText !== currentDialogue.dialogue.original ||
      timeStart !== currentDialogue.timeStart ||
      timeEnd !== currentDialogue.timeEnd
    );
  }, [currentDialogue, character, pendingOriginalText, timeStart, timeEnd]);

  // Save changes with approval
  const handleApproveAndSave = useCallback(async () => {
    if (!currentDialogue) return;
    
    try {
      setNetworkStatus('saving');
      setIsSaving(true);
      
      if (currentDialogue.projectId !== projectId) {
        throw new Error('Project ID mismatch');
      }
      
      const updateData = {
        dialogue: {
          original: pendingOriginalText || currentDialogue.dialogue.original,
          translated: currentDialogue.dialogue.translated || '',
          adapted: currentDialogue.dialogue.adapted || '',
        },
        character: character || currentDialogue.character || '',
        status: 'transcribed',
        timeStart: timeStart || currentDialogue.timeStart,
        timeEnd: timeEnd || currentDialogue.timeEnd,
        index: currentDialogue.index,
        projectId
      };
      
      const { data: responseData } = await axios.patch(
        `/api/dialogues/${currentDialogue._id}`,
        updateData
      );
      
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

      setNetworkStatus('success');
      setShowConfirmation(false);
      setTimeout(() => setNetworkStatus('idle'), 2000);

      if (currentDialogueIndex < dialoguesList.length - 1) {
        setCurrentDialogueIndex(prev => prev + 1);
      }
    } catch (error) {
      console.error('Save error details:', {
        error,
        dialogue: currentDialogue,
        projectContext: {
          componentProjectId: projectId,
          dialogueProjectId: currentDialogue.projectId,
          dialogueId: currentDialogue._id
        },
        requestData: {
          character,
          pendingOriginalText,
          timeStart,
          timeEnd,
        }
      });
      
      setNetworkStatus('error');
      setError(
        error instanceof Error 
          ? `Save failed: ${error.message}` 
          : 'Failed to save transcription'
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    currentDialogue,
    projectId,
    pendingOriginalText,
    character,
    timeStart,
    timeEnd,
    currentDialogueIndex,
    dialoguesList.length,
    queryClient,
    setDialoguesList,
    setNetworkStatus,
    setShowConfirmation,
    setCurrentDialogueIndex,
    setError,
    setIsSaving
  ]);

  // Key press event handler
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!currentDialogue) return;

      if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrevious();
      } else if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        togglePlayPause();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentDialogue, handleNext, handlePrevious, togglePlayPause]);

  // Auto-save functionality
  useEffect(() => {
    const shouldAutoSave = currentDialogue && hasChanges();
    if (!shouldAutoSave) return;

    const autoSaveTimeout = setTimeout(() => {
      handleApproveAndSave();
    }, AUTO_SAVE_DELAY);

    return () => clearTimeout(autoSaveTimeout);
  }, [currentDialogue, hasChanges, handleApproveAndSave]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleLoadStart = () => setIsVideoLoading(true);
    const handleCanPlay = () => setIsVideoLoading(false);
    const handleWaiting = () => setIsVideoLoading(true);
    const handlePlaying = () => setIsVideoLoading(false);
    const handleTimeUpdate = () => {
      if (!currentDialogue) return;
      const currentTime = video.currentTime;
      // Add your time update logic here using currentTime
      // For example: update progress bar, check if current time is within dialogue time range, etc.
      if (currentTime >= parseFloat(currentDialogue.timeEnd)) {
        video.pause();
        setIsPlaying(false);
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [currentDialogue]);

  // Reset changes and continue navigation
  const handleDiscardChanges = () => {
    setShowConfirmation(false);
    if (currentDialogue) {
      setCharacter(currentDialogue.character || '');
      setPendingOriginalText(currentDialogue.dialogue.original || '');
      setTimeStart(currentDialogue.timeStart);
      setTimeEnd(currentDialogue.timeEnd);
    }
  };

  // Add timestamp marker functionality
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
  };

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      const currentTime = videoRef.current.currentTime;
      setTimeStart(formatTime(currentTime));
    }
  };

  // Add status indicator component
  const NetworkStatusIndicator = () => {
    const statusConfig = {
      saving: { bg: 'bg-blue-500', text: 'Saving...' },
      error: { bg: 'bg-red-500', text: 'Error saving' },
      success: { bg: 'bg-green-500', text: 'Saved!' },
    };

    if (networkStatus === 'idle') return null;

    const config = statusConfig[networkStatus as keyof typeof statusConfig];
    
    return (
      <div className={`fixed bottom-20 left-1/2 transform -translate-x-1/2 ${config.bg} text-white px-4 py-2 rounded-full shadow-lg text-sm`}>
        {config.text}
      </div>
    );
  };

  // Add video control functions
  const rewindFiveSeconds = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
    }
  };

  const changePlaybackRate = (rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  // Add episode selection handler
  const handleEpisodeChange = async (episodeId: string) => {
    const episode = episodes.find(ep => ep._id === episodeId);
    if (!episode) {
      console.error('Episode not found:', episodeId);
      setError('Selected episode not found');
      return;
    }

    setError(''); // Clear any previous errors
    
    try {
      console.log('Fetching dialogues for episode:', {
        projectId,
        episodeName: episode.name,
        episodeId: episode._id
      });

      // Fetch dialogues for the selected episode
      const response = await axios.get(`/api/dialogues?projectId=${projectId}&episodeName=${encodeURIComponent(episode.name)}`);
      
      if (!response.data?.data) {
        throw new Error('No dialogue data received from server');
      }

      console.log('Fetched dialogues:', {
        count: response.data.data.length,
        episodeName: episode.name
      });

      setDialoguesList(response.data.data);
      setCurrentDialogueIndex(0);
    } catch (error) {
      console.error('Failed to fetch dialogues for episode:', error);
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error || error.message;
        setError(`Failed to load dialogues: ${errorMessage}`);
        // Log additional error details
        console.error('API Error Details:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
      } else {
        setError('An unexpected error occurred while loading dialogues');
      }
    }
  };

  // Add episode info section to the UI
  const EpisodeInfo = () => (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Current Episode
          </label>
          <select
            value={currentDialogue?._id || ''}
            onChange={(e) => handleEpisodeChange(e.target.value)}
            className="w-full p-2 text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            {episodes.map((episode) => (
              <option key={episode._id} value={episode._id}>
                {episode.name} ({episode.status})
              </option>
            ))}
          </select>
        </div>
        {currentDialogue && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <div>Collection: {currentDialogue.collectionName}</div>
            <div>Uploaded: {currentDialogue.uploadedAt ? (typeof currentDialogue.uploadedAt === 'string' ? new Date(currentDialogue.uploadedAt).toLocaleDateString() : currentDialogue.uploadedAt.toLocaleDateString()) : 'Not available'}</div>
          </div>
        )}
      </div>
    </div>
  );

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const SWIPE_THRESHOLD = 50;
    const velocity = Math.abs(info.velocity.x);
    const offset = Math.abs(info.offset.x);

    if (offset < SWIPE_THRESHOLD || velocity < 0.5) {
      animControls.start({ x: 0, opacity: 1 })
      return;
    }

    const direction = info.offset.x > 0 ? 'right' : 'left'
    
    if (direction === 'left' && currentDialogueIndex < dialoguesList.length - 1) {
      animControls.start({ 
        x: -200, 
        opacity: 0,
        transition: { duration: 0.2 }
      }).then(() => {
        handleNext();
        animControls.set({ x: 0, opacity: 1 });
      });
    } else if (direction === 'right' && currentDialogueIndex > 0) {
      animControls.start({ 
        x: 200, 
        opacity: 0,
        transition: { duration: 0.2 }
      }).then(() => {
        handlePrevious();
        animControls.set({ x: 0, opacity: 1 });
      });
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 space-y-4 sm:space-y-6">
      <EpisodeInfo />
      
      {/* Video Player Card */}
      <div className="bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700 overflow-hidden">
        <div className="relative">
          <video
            ref={videoRef}
            src={currentDialogue?.videoUrl}
            className="w-full"
          />
          {isVideoLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
                <span className="text-sm text-white">Loading video...</span>
              </div>
            </div>
          )}
        </div>
        
        {/* Video Controls */}
        <div className="p-3 flex items-center justify-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={rewindFiveSeconds}
              className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              -5s
            </button>
            <button
              onClick={togglePlayPause}
              className="px-4 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-700 dark:text-gray-300">Speed:</span>
            {[0.5, 0.75, 1].map((rate) => (
              <button
                key={rate}
                onClick={() => changePlaybackRate(rate)}
                className={`px-2 py-1 rounded ${
                  videoRef.current?.playbackRate === rate
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Dialogue Information Card */}
      <motion.div
        className="bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        animate={animControls}
        style={{ x, rotate, opacity, scale }}
        onDragEnd={handleDragEnd}
        whileTap={{ cursor: 'grabbing' }}
        transition={{ 
          type: "spring", 
          stiffness: 300, 
          damping: 30,
          opacity: { duration: 0.2 },
          scale: { duration: 0.2 }
        }}
      >
        <div className="p-3 sm:p-5 space-y-3 sm:space-y-4">
          {/* Character Input */}
          <div>
            <label htmlFor="character" className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">
              Character
            </label>
            <input
              type="text"
              id="character"
              value={character}
              onChange={(e) => setCharacter(e.target.value)}
              className="w-full p-2 text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          {/* Transcription Text */}
          <div>
            <label htmlFor="originalText" className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">
              Transcription
            </label>
            <textarea
              id="originalText"
              value={pendingOriginalText}
              onChange={(e) => setPendingOriginalText(e.target.value)}
              rows={3}
              className="w-full p-2 text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-y min-h-[100px]"
              placeholder="Type the dialogue transcription here..."
            />
          </div>

          {/* Navigation and Info */}
          <div className="flex items-center justify-center pt-3 sm:pt-4 mt-3 sm:mt-4 border-t border-gray-200 dark:border-gray-600">
            <div className="text-center">
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                Dialogue {currentDialogueIndex + 1} of {dialoguesList.length}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {timeStart} - {timeEnd}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Unsaved Changes</h3>
            <p className="mb-4">You have unsaved changes. What would you like to do?</p>
            <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4">
              <button
                onClick={handleDiscardChanges}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white text-sm"
              >
                Discard Changes
              </button>
              <button
                onClick={() => setShowConfirmation(false)}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
              >
                Keep Editing
              </button>
              <button
                onClick={handleApproveAndSave}
                disabled={isSaving}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {isSaving ? 'Saving...' : 'Save Transcription'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Messages */}
      <div className="fixed top-4 right-4 left-4 sm:left-auto z-50 flex flex-col gap-2">
        {isSaving && (
          <div className="bg-blue-500 text-white px-4 py-2 rounded shadow-lg text-sm text-center sm:text-left">
            Saving transcription...
          </div>
        )}
        
        {showSaveSuccess && (
          <div className="bg-green-500 text-white px-4 py-2 rounded shadow-lg text-sm text-center sm:text-left">
            Transcription saved successfully!
          </div>
        )}
        
        {error && (
          <div className="bg-red-500 text-white px-4 py-2 rounded shadow-lg text-sm text-center sm:text-left">
            {error}
          </div>
        )}
      </div>

      {/* Network status indicator */}
      <NetworkStatusIndicator />
    </div>
  )
} 