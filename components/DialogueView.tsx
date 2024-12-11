'use client'

import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, useMotionValue, useTransform, useAnimation, type MotionValue, type PanInfo } from 'framer-motion'

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

interface SwipeHandlers {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}

// Create a type for the animation values
interface AnimationConfig {
  x: MotionValue<number>;
  rotateZ: MotionValue<number>;
  opacity: MotionValue<number>;
}

// Create proper types for your event handlers
type SwipeEventHandler = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;

// Update QueryData type to be more specific
type QueryData = {
  data: Dialogue[];
  status: string;
  timestamp: number;
};

export default function DialogueView({ dialogues: initialDialogues, projectId }: DialogueViewProps) {
  const [dialoguesList, setDialoguesList] = useState(initialDialogues);
  const [currentDialogueIndex, setCurrentDialogueIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [error, setError] = useState<string>('');
  const [character, setCharacter] = useState('');
  const [pendingOriginalText, setPendingOriginalText] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const queryClient = useQueryClient();

  const currentDialogue = dialoguesList[currentDialogueIndex];

  // Check for unsaved changes
  const hasChanges = () => {
    if (!currentDialogue) return false;
    return (
      character !== currentDialogue.character ||
      pendingOriginalText !== currentDialogue.dialogue.original
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
      setCharacter(currentDialogue.character || '');
      setPendingOriginalText(currentDialogue.dialogue.original || '');
    }
  };

  // Save changes with approval
  const handleApproveAndSave = async () => {
    if (!currentDialogue) return;
    
    try {
      setIsSaving(true);
      console.log('Saving dialogue:', currentDialogue._id);
      
      const updateData = {
        dialogue: {
          original: pendingOriginalText || currentDialogue.dialogue.original,
          translated: currentDialogue.dialogue.translated || '',
          adapted: currentDialogue.dialogue.adapted || '',
        },
        character: character || currentDialogue.character || '',
        status: 'approved',
        timeStart: currentDialogue.timeStart,
        timeEnd: currentDialogue.timeEnd,
        index: currentDialogue.index,
      };
      
      console.log('Update payload:', updateData);
      
      const response = await fetch(`/api/dialogues/${currentDialogue._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      const responseData = await response.json();
      
      if (!response.ok) {
        console.error('Server error response:', responseData);
        throw new Error(responseData.error || 'Failed to save dialogue');
      }

      console.log('Dialogue saved and approved successfully:', responseData);
      
      // Update the dialogue in the list
      setDialoguesList(prevDialogues => 
        prevDialogues.map(d => 
          d._id === currentDialogue._id ? responseData : d
        )
      );

      // Update React Query cache
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

      // Move to next dialogue if available
      if (currentDialogueIndex < dialoguesList.length - 1) {
        setCurrentDialogueIndex(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error saving dialogue:', error);
      setError(error instanceof Error ? error.message : 'Failed to save dialogue');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  // Motion values for swipe animation
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-10, 10])
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0.5, 1, 1, 1, 0.5])
  const scale = useTransform(
    x,
    [-200, -150, 0, 150, 200],
    [0.8, 0.9, 1, 0.9, 0.8]
  )
  const animControls = useAnimation()

  useEffect(() => {
    if (currentDialogue) {
      setCharacter(currentDialogue.character || '')
      setPendingOriginalText(currentDialogue.dialogue.original || '')
    }
  }, [currentDialogue])

  // Type the event and info parameters
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

  if (!currentDialogue) {
    return <div className="text-center p-4">No dialogues available.</div>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Video Player Card */}
      <div className="bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700 overflow-hidden">
        <video
          ref={videoRef}
          src={currentDialogue.videoUrl}
          controls
          className="w-full"
        />
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
              className="w-full p-2.5 text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          {/* Original Text */}
          <div>
            <label htmlFor="originalText" className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">
              Original
            </label>
            <textarea
              id="originalText"
              value={pendingOriginalText}
              onChange={(e) => setPendingOriginalText(e.target.value)}
              rows={3}
              className="w-full p-2.5 text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
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
                {isSaving ? 'Approving...' : 'Approve & Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save feedback */}
      {isSaving && (
        <div className="fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded shadow-lg z-50">
          Saving...
        </div>
      )}
      
      {showSaveSuccess && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50">
          Saved successfully!
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