import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, useMotionValue, useTransform, useAnimation, type PanInfo } from 'framer-motion'

interface Dialogue {
  _id: string
  index: number
  timeStart: string
  timeEnd: string
  character: string
  videoUrl: string
  dialogue: {
    original: string
    translated: string
    adapted: string
  }
  status: string
}

interface DialogueViewProps {
  dialogues: Dialogue[]
  projectId: string
}

type QueryData = {
  data: Dialogue[];
  status: string;
  timestamp: number;
};

export default function TranslatorDialogueView({ dialogues: initialDialogues, projectId }: DialogueViewProps) {
  const [dialoguesList, setDialoguesList] = useState(initialDialogues);
  const [currentDialogueIndex, setCurrentDialogueIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [error, setError] = useState<string>('');
  const [pendingTranslatedText, setPendingTranslatedText] = useState('');
  const [pendingAdaptedText, setPendingAdaptedText] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const queryClient = useQueryClient();
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const translationTextareaRef = useRef<HTMLTextAreaElement>(null);
  const adaptedTextareaRef = useRef<HTMLTextAreaElement>(null);

  const currentDialogue = dialoguesList[currentDialogueIndex];

  // Check for unsaved changes
  const hasChanges = () => {
    if (!currentDialogue) return false;
    return pendingTranslatedText !== currentDialogue.dialogue.translated || 
           pendingAdaptedText !== currentDialogue.dialogue.adapted;
  };

  // Navigation handlers
  const handleNext = () => {
    if (hasChanges()) {
      setShowConfirmation(true);
    } else if (currentDialogueIndex < dialoguesList.length - 1) {
      setCurrentDialogueIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentDialogueIndex > 0) {
      if (hasChanges()) {
        setShowConfirmation(true);
      } else {
        setCurrentDialogueIndex(prev => prev - 1);
      }
    }
  };

  // Reset changes and continue navigation
  const handleDiscardChanges = () => {
    setShowConfirmation(false);
    if (currentDialogue) {
      setPendingTranslatedText(currentDialogue.dialogue.translated || '');
      setPendingAdaptedText(currentDialogue.dialogue.adapted || '');
    }
  };

  // Save changes with approval
  const handleApproveAndSave = async () => {
    if (!currentDialogue) return;
    
    try {
      setIsSaving(true);
      
      const updateData = {
        dialogue: {
          original: currentDialogue.dialogue.original,
          translated: pendingTranslatedText,
          adapted: pendingAdaptedText,
        },
        character: currentDialogue.character,
        status: 'translated',
        timeStart: currentDialogue.timeStart,
        timeEnd: currentDialogue.timeEnd,
        index: currentDialogue.index,
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
        throw new Error(responseData.error || 'Failed to save translation');
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
      setTimeout(() => setShowSaveSuccess(false), 2000);

      if (currentDialogueIndex < dialoguesList.length - 1) {
        setCurrentDialogueIndex(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error saving translation:', error);
      setError(error instanceof Error ? error.message : 'Failed to save translation');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  // Motion values for swipe animation
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-10, 10])
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0.5, 1, 1, 1, 0.5])
  const scale = useTransform(x, [-200, -150, 0, 150, 200], [0.8, 0.9, 1, 0.9, 0.8])
  const animControls = useAnimation()

  useEffect(() => {
    if (currentDialogue) {
      setPendingTranslatedText(currentDialogue.dialogue.translated || '')
      setPendingAdaptedText(currentDialogue.dialogue.adapted || '')
    }
  }, [currentDialogue])

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.x) < 100) {
      animControls.start({ x: 0, opacity: 1 })
    } else {
      const direction = info.offset.x > 0 ? 'right' : 'left'
      if (direction === 'left' && currentDialogueIndex < dialoguesList.length - 1) {
        handleNext();
      } else if (direction === 'right' && currentDialogueIndex > 0) {
        handlePrevious();
      }
    }
  };

  // Add video control functions
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

  const rewindFiveSeconds = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
    }
  };

  const changePlaybackRate = (rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
  };

  // Add useEffect for video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      
      return () => {
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
      };
    }
  }, []);

  // Add video loading event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      const handleLoadStart = () => setIsVideoLoading(true);
      const handleCanPlay = () => setIsVideoLoading(false);
      const handleWaiting = () => setIsVideoLoading(true);
      const handlePlaying = () => setIsVideoLoading(false);
      
      video.addEventListener('loadstart', handleLoadStart);
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('waiting', handleWaiting);
      video.addEventListener('playing', handlePlaying);
      
      return () => {
        video.removeEventListener('loadstart', handleLoadStart);
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('waiting', handleWaiting);
        video.removeEventListener('playing', handlePlaying);
      };
    }
  }, []);

  // Function to adjust textarea height
  const adjustTextareaHeight = (textarea: HTMLTextAreaElement | null) => {
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  // Adjust heights when text changes
  useEffect(() => {
    adjustTextareaHeight(translationTextareaRef.current);
  }, [pendingTranslatedText]);

  useEffect(() => {
    adjustTextareaHeight(adaptedTextareaRef.current);
  }, [pendingAdaptedText]);

  // Adjust heights when dialogue changes
  useEffect(() => {
    if (currentDialogue) {
      setPendingTranslatedText(currentDialogue.dialogue.translated || '');
      setPendingAdaptedText(currentDialogue.dialogue.adapted || '');
      // Add small delay to ensure state is updated before adjusting height
      setTimeout(() => {
        adjustTextareaHeight(translationTextareaRef.current);
        adjustTextareaHeight(adaptedTextareaRef.current);
      }, 0);
    }
  }, [currentDialogue]);

  if (!currentDialogue) {
    return <div className="text-center p-4">No dialogues available.</div>
  }

  return (
    <div className="w-full h-screen flex flex-col bg-gray-900 overflow-hidden">
      <div className="w-full h-full flex flex-col overflow-hidden">
        {/* Video Player Card */}
        <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700">
          <div className="relative h-[25vh] min-h-[180px] max-h-[280px]">
            <video
              ref={videoRef}
              src={currentDialogue.videoUrl}
              className="w-full h-full object-contain bg-black"
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
          <div className="p-1.5 flex items-center justify-center gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5">
              <button
                onClick={rewindFiveSeconds}
                className="px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs"
              >
                -5s
              </button>
              <button
                onClick={togglePlayPause}
                className="px-3 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs"
              >
                {isPlaying ? 'Pause' : 'Play'}
              </button>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              <span className="text-xs text-gray-300">Speed:</span>
              {[0.5, 0.75, 1, 1.25, 1.5].map((rate) => (
                <button
                  key={rate}
                  onClick={() => changePlaybackRate(rate)}
                  className={`px-1.5 py-0.5 rounded text-xs ${
                    playbackRate === rate
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Time Info */}
        <div className="flex-shrink-0 flex items-center gap-2 p-1.5 bg-gray-800 border-b border-gray-700 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-gray-300">Start:</span>
            <span className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300">
              {currentDialogue.timeStart || '00:00.000'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-300">End:</span>
            <span className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300">
              {currentDialogue.timeEnd || '00:00.000'}
            </span>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-grow overflow-y-auto min-h-0">
          <motion.div
            className="h-full"
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
            <div className="p-2 space-y-2">
              {/* Character Display */}
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-300">
                  Character
                </label>
                <div className="w-full p-1.5 text-xs rounded bg-gray-700 text-gray-300 border border-gray-600">
                  {currentDialogue.character}
                </div>
              </div>

              {/* Original Text */}
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-300">
                  Original Text
                </label>
                <div className="w-full p-1.5 text-xs rounded bg-gray-700 text-gray-300 border border-gray-600">
                  {currentDialogue.dialogue.original}
                </div>
              </div>

              {/* Translation Input */}
              <div>
                <label htmlFor="translatedText" className="block text-xs font-medium mb-1 text-gray-300">
                  Translation
                </label>
                <textarea
                  ref={translationTextareaRef}
                  id="translatedText"
                  value={pendingTranslatedText}
                  onChange={(e) => setPendingTranslatedText(e.target.value)}
                  className="w-full p-1.5 text-xs rounded bg-gray-700 text-gray-300 border border-gray-600 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 min-h-[40px] overflow-hidden resize-none"
                  style={{ height: 'auto' }}
                />
              </div>

              {/* Adapted Text Input */}
              <div>
                <label htmlFor="adaptedText" className="block text-xs font-medium mb-1 text-gray-300">
                  Adapted
                </label>
                <textarea
                  ref={adaptedTextareaRef}
                  id="adaptedText"
                  value={pendingAdaptedText}
                  onChange={(e) => setPendingAdaptedText(e.target.value)}
                  className="w-full p-1.5 text-xs rounded bg-gray-700 text-gray-300 border border-gray-600 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 min-h-[40px] overflow-hidden resize-none"
                  style={{ height: 'auto' }}
                />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 bg-gray-800 border-t border-gray-700">
          <div className="flex items-center justify-center h-[3vh] min-h-[24px] max-h-[32px]">
            <div className="text-xs text-gray-300">
              Dialogue {currentDialogueIndex + 1} of {dialoguesList.length}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Unsaved Changes</h3>
            <p className="mb-4">You have unsaved changes. What would you like to do?</p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={handleDiscardChanges}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
              >
                Discard Changes
              </button>
              <button
                onClick={() => setShowConfirmation(false)}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Keep Editing
              </button>
              <button
                onClick={handleApproveAndSave}
                disabled={isSaving}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save Translation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Messages */}
      {isSaving && (
        <div className="fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded shadow-lg z-50">
          Saving translation...
        </div>
      )}
      
      {showSaveSuccess && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50">
          Translation saved successfully!
        </div>
      )}
      
      {error && (
        <div className="fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg z-50">
          {error}
        </div>
      )}
    </div>
  )
} 