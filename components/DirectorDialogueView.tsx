'use client'

import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, useMotionValue, useAnimation, type PanInfo } from 'framer-motion'
import axios from 'axios'
import { Dialogue as BaseDialogue } from '@/types/dialogue'
import { useCacheCleaner } from '@/hooks/useCacheCleaner'

// Extend the base dialogue type with additional fields needed for the director view
interface DirectorDialogue extends BaseDialogue {
  index: number;
  character: string;
  videoUrl: string;
  revisionRequested?: boolean;
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

// Adapter function to convert BaseDialogue to DirectorDialogue
const adaptDialogue = (dialogue: BaseDialogue): DirectorDialogue => ({
  ...dialogue,
  index: dialogue.subtitleIndex,
  character: dialogue.characterName,
  videoUrl: dialogue.videoClipUrl,
  revisionRequested: dialogue.status === 'revision-requested'
});

const useTransform = motion.transform;

export default function DirectorDialogueView({ dialogues: initialDialogues, projectId }: DialogueViewProps) {
  // Initialize cache cleaner
  useCacheCleaner();

  // Convert dialogues using the adapter
  const adaptedInitialDialogues = initialDialogues.map(adaptDialogue);
  
  const [dialoguesList, setDialoguesList] = useState(adaptedInitialDialogues);
  const [currentDialogueIndex, setCurrentDialogueIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [error, setError] = useState<string>('');
  const [directorNotes, setDirectorNotes] = useState('');
  const [revisionRequested, setRevisionRequested] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const queryClient = useQueryClient();
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const currentDialogue = dialoguesList[currentDialogueIndex];

  // Check for unsaved changes
  const hasChanges = () => {
    if (!currentDialogue) return false;
    return (
      directorNotes !== (currentDialogue.directorNotes || '') ||
      revisionRequested !== (currentDialogue.revisionRequested || false)
    );
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
      setDirectorNotes(currentDialogue.directorNotes || '');
      setRevisionRequested(currentDialogue.revisionRequested || false);
    }
  };

  // Save changes with approval
  const handleApproveAndSave = async () => {
    if (!currentDialogue) return;
    
    try {
      setIsSaving(true);
      
      const updateData = {
        dialogue: currentDialogue.dialogue,
        character: currentDialogue.character,
        status: revisionRequested ? 'revision-requested' : 'approved',
        timeStart: currentDialogue.timeStart,
        timeEnd: currentDialogue.timeEnd,
        index: currentDialogue.index,
        voiceOverUrl: currentDialogue.voiceOverUrl,
        voiceOverNotes: currentDialogue.voiceOverNotes,
        directorNotes,
        revisionRequested,
      };
      
      const { data: responseData } = await axios.patch(`/api/dialogues/${currentDialogue._id}`, updateData, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
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
      console.error('Error saving review:', error);
      setError(error instanceof Error ? error.message : 'Failed to save review');
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
      setDirectorNotes(currentDialogue.directorNotes || '')
      setRevisionRequested(currentDialogue.revisionRequested || false)
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

  if (!currentDialogue) {
    return <div className="text-center p-4">No dialogues available.</div>
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 space-y-4 sm:space-y-6">
      {/* Video Player Card */}
      <div className="bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700 overflow-hidden">
        <video
          ref={videoRef}
          src={currentDialogue.videoClipUrl}
          controls
          className="w-full"
        />
        
        {/* Video Controls */}
        <div className="p-3 sm:p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={rewindFiveSeconds}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
              >
                -5s
              </button>
              <button
                onClick={togglePlayPause}
                className="px-4 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
              >
                {isPlaying ? 'Pause' : 'Play'}
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span className="text-sm text-gray-600 dark:text-gray-300">Speed:</span>
              {[0.5, 0.75, 1, 1.25, 1.5].map((rate) => (
                <button
                  key={rate}
                  onClick={() => changePlaybackRate(rate)}
                  className={`px-2 py-1 rounded text-sm ${
                    playbackRate === rate
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
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
        <div className="p-5 space-y-4">
          {/* Time Display */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white">Start:</span>
              <p className="px-2 py-1 rounded-md border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white min-w-[100px] text-center">
                {currentDialogue.timeStart || '00:00.000'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white">End:</span>
              <p className="px-2 py-1 rounded-md border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white min-w-[100px] text-center">
                {currentDialogue.timeEnd || '00:00.000'}
              </p>
            </div>
          </div>

          {/* All Text Versions */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">
                Original Text
              </label>
              <div className="w-full p-2.5 text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                {currentDialogue.dialogue.original}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">
                Translated Text
              </label>
              <div className="w-full p-2.5 text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                {currentDialogue.dialogue.translated}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">
                Adapted Text
              </label>
              <div className="w-full p-2.5 text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                {currentDialogue.dialogue.adapted}
              </div>
            </div>
          </div>

          {/* Voice-over Player */}
          {currentDialogue.voiceOverUrl && (
            <div className="flex items-center justify-center">
              <audio controls src={currentDialogue.voiceOverUrl} className="w-64" />
            </div>
          )}

          {/* Voice-over Notes Display */}
          {currentDialogue.voiceOverNotes && (
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">
                Voice-over Notes
              </label>
              <div className="w-full p-2.5 text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                {currentDialogue.voiceOverNotes}
              </div>
            </div>
          )}

          {/* Director Notes */}
          <div>
            <label htmlFor="directorNotes" className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">
              Director Notes
            </label>
            <textarea
              id="directorNotes"
              value={directorNotes}
              onChange={(e) => setDirectorNotes(e.target.value)}
              rows={3}
              className="w-full p-2.5 text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="Add review notes, suggestions, or requirements..."
            />
          </div>

          {/* Revision Request Toggle */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="revisionRequested"
              checked={revisionRequested}
              onChange={(e) => setRevisionRequested(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <label htmlFor="revisionRequested" className="text-sm font-medium text-gray-900 dark:text-white">
              Request Revision
            </label>
          </div>

          {/* Navigation and Info */}
          <div className="flex items-center justify-center pt-4 mt-4 border-t border-gray-200 dark:border-gray-600">
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
                {isSaving ? 'Saving...' : revisionRequested ? 'Request Revision' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Messages */}
      {isSaving && (
        <div className="fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded shadow-lg z-50">
          Saving review...
        </div>
      )}
      
      {showSaveSuccess && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50">
          Review saved successfully!
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