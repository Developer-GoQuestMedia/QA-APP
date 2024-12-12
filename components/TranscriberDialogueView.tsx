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

export default function TranscriberDialogueView({ dialogues: initialDialogues, projectId }: DialogueViewProps) {
  const [dialoguesList, setDialoguesList] = useState(initialDialogues);
  const [currentDialogueIndex, setCurrentDialogueIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [error, setError] = useState<string>('');
  const [character, setCharacter] = useState('');
  const [pendingOriginalText, setPendingOriginalText] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const queryClient = useQueryClient();

  const currentDialogue = dialoguesList[currentDialogueIndex];

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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const captureCurrentTime = (type: 'start' | 'end') => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      const formattedTime = formatTime(time);
      if (type === 'start') {
        setTimeStart(formattedTime);
      } else {
        setTimeEnd(formattedTime);
      }
    }
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
  };

  // Check for unsaved changes
  const hasChanges = () => {
    if (!currentDialogue) return false;
    return (
      character !== currentDialogue.character ||
      pendingOriginalText !== currentDialogue.dialogue.original ||
      timeStart !== currentDialogue.timeStart ||
      timeEnd !== currentDialogue.timeEnd
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
      setTimeStart(currentDialogue.timeStart);
      setTimeEnd(currentDialogue.timeEnd);
    }
  };

  // Save changes with approval
  const handleApproveAndSave = async () => {
    if (!currentDialogue) return;
    
    try {
      setIsSaving(true);
      
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
        throw new Error(responseData.error || 'Failed to save transcription');
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
      console.error('Error saving transcription:', error);
      setError(error instanceof Error ? error.message : 'Failed to save transcription');
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
      setCharacter(currentDialogue.character || '')
      setPendingOriginalText(currentDialogue.dialogue.original || '')
      setTimeStart(currentDialogue.timeStart)
      setTimeEnd(currentDialogue.timeEnd)
    }
  }, [currentDialogue])

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
    <div className="w-full max-w-4xl mx-auto px-4 space-y-4 sm:space-y-6">
      {/* Video Player Card */}
      <div className="bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700 overflow-hidden">
        <video
          ref={videoRef}
          src={currentDialogue.videoUrl}
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
        <div className="p-3 sm:p-5 space-y-3 sm:space-y-4">
          {/* Time Controls */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white">Start:</span>
              <p className="px-2 py-1 rounded-md border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white min-w-[100px] text-center">
                {timeStart || '00:00.000'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white">End:</span>
              <p className="px-2 py-1 rounded-md border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white min-w-[100px] text-center">
                {timeEnd || '00:00.000'}
              </p>
            </div>
          </div>

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
    </div>
  )
} 