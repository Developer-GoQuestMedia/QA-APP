'use client'

import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, useMotionValue, useTransform, useAnimation, type PanInfo } from 'framer-motion'
import axios from 'axios'
import { Dialogue as BaseDialogue } from '@/types/dialogue'
import { useCacheCleaner } from '@/hooks/useCacheCleaner'

// Extend the base dialogue type with additional fields needed for the translator view
interface TranslatorDialogue extends BaseDialogue {
  index: number;
  character: string;
  videoUrl: string;
}

interface DialogueViewProps {
  dialogues: BaseDialogue[]
  projectId: string
}

type QueryData = {
  data: BaseDialogue[];
  status: string;
  timestamp: number;
};

// Adapter function to convert BaseDialogue to TranslatorDialogue
const adaptDialogue = (dialogue: BaseDialogue): TranslatorDialogue => ({
  ...dialogue,
  index: dialogue.subtitleIndex,
  character: dialogue.characterName,
  videoUrl: dialogue.videoClipUrl
});

export default function TranslatorDialogueView({ dialogues: initialDialogues, projectId }: DialogueViewProps) {
  // Initialize cache cleaner
  useCacheCleaner();

  // Convert dialogues using the adapter
  const adaptedInitialDialogues = initialDialogues.map(adaptDialogue);
  
  const [dialoguesList, setDialoguesList] = useState<TranslatorDialogue[]>(adaptedInitialDialogues);
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
          original: currentDialogue.dialogue.original || '',
          translated: pendingTranslatedText || '',
          adapted: pendingAdaptedText || '',
        },
        character: currentDialogue.character || '',
        status: 'translated',
        timeStart: currentDialogue.timeStart || '',
        timeEnd: currentDialogue.timeEnd || '',
        index: currentDialogue.index,
        projectId
      };
      
      console.log('Translation save attempt:', {
        dialogueId: currentDialogue._id,
        projectId,
        updateData
      });
      
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
          data: oldData.data.map((d: BaseDialogue) => 
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
      console.error('Translation save error:', {
        error,
        dialogue: currentDialogue,
        projectId,
        requestData: {
          translated: pendingTranslatedText,
          adapted: pendingAdaptedText
        }
      });
      setError(error instanceof Error ? error.message : 'Failed to save translation');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  // Motion values for swipe animation
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-90, 90], [-10, 10])
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
    <div className="w-full max-w-4xl mx-auto px-4 space-y-4 sm:space-y-6">
      {/* Video Player Card */}
      <div className="bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700 overflow-hidden">
        <div className="relative">
          <video
            ref={videoRef}
            src={currentDialogue.videoUrl}
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
                  playbackRate === rate
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

      {/* Main Content Card */}
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
          {/* Character Display */}
          {/* <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Character:
            </span>
            <span className="text-gray-900 dark:text-white">
              {currentDialogue.character}
            </span>
          </div> */}

          {/* Original Text */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">
              Original Text
            </label>
            <div className="w-full p-2 text-gray-900 dark:text-white">
              {currentDialogue.dialogue.original}
            </div>
          </div>

          {/* Translation Input */}
          <div>
            <label htmlFor="translatedText" className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">
              Translation
            </label>
            <textarea
              ref={translationTextareaRef}
              id="translatedText"
              value={pendingTranslatedText}
              onChange={(e) => setPendingTranslatedText(e.target.value)}
              className="w-full p-2 rounded-lg border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none"
            />
          </div>

          {/* Adapted Text Input */}
          <div>
            <label htmlFor="adaptedText" className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">
              Adapted
            </label>
            <textarea
              ref={adaptedTextareaRef}
              id="adaptedText"
              value={pendingAdaptedText}
              onChange={(e) => setPendingAdaptedText(e.target.value)}
              className="w-full p-2 rounded-lg border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none"
            />
          </div>

          {/* Navigation and Info */}
          <div className="flex items-center justify-center pt-3 sm:pt-4 mt-3 sm:mt-4 border-t border-gray-200 dark:border-gray-600">
            <div className="text-center">
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                Dialogue {currentDialogueIndex + 1} of {dialoguesList.length}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {currentDialogue.timeStart} - {currentDialogue.timeEnd}
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
            <div className="flex justify-end gap-2 sm:gap-4">
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
                {isSaving ? 'Saving...' : 'Save Translation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Messages */}
      <div className="fixed top-4 right-4 left-4 sm:left-auto z-50 flex flex-col gap-2">
        {isSaving && (
          <div className="bg-blue-500 text-white px-4 py-2 rounded shadow-lg text-sm text-center sm:text-left">
            Saving translation...
          </div>
        )}
        
        {showSaveSuccess && (
          <div className="bg-green-500 text-white px-4 py-2 rounded shadow-lg text-sm text-center sm:text-left">
            Translation saved successfully!
          </div>
        )}
        
        {error && (
          <div className="bg-red-500 text-white px-4 py-2 rounded shadow-lg text-sm text-center sm:text-left">
            {error}
          </div>
        )}
      </div>
    </div>
  )
} 