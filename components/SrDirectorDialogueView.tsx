'use client'

import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, useMotionValue, useAnimation, type PanInfo } from 'framer-motion'
import axios from 'axios'
import { Dialogue as BaseDialogue } from '@/types/dialogue'
import { useCacheCleaner } from '@/hooks/useCacheCleaner'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface SrDirectorDialogue extends BaseDialogue {
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

const adaptDialogue = (dialogue: BaseDialogue): SrDirectorDialogue => ({
  ...dialogue,
  index: dialogue.subtitleIndex,
  character: dialogue.characterName,
  videoUrl: dialogue.videoClipUrl,
  revisionRequested: dialogue.status === 'revision-requested'
});

const useTransform = motion.transform;

export default function SrDirectorDialogueView({ dialogues: initialDialogues, projectId }: DialogueViewProps) {
  const { data: session, status } = useSession()
  const router = useRouter()
  useCacheCleaner()

  // Add session validation
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session?.user?.role !== 'srDirector') {
      router.push('/unauthorized')
    }
  }, [status, session, router])

  // Convert dialogues using the adapter
  const adaptedInitialDialogues = initialDialogues.map(adaptDialogue);
  
  const sortedDialogues = [...adaptedInitialDialogues].sort((a, b) => 
    (a.subtitleIndex ?? 0) - (b.subtitleIndex ?? 0)
  );

  console.log('SrDirectorDialogueView - Initial state:', {
    totalDialogues: sortedDialogues.length,
    firstDialogue: sortedDialogues[0],
    lastDialogue: sortedDialogues[sortedDialogues.length - 1]
  });
  
  // State declarations
  const [dialoguesList, setDialoguesList] = useState<SrDirectorDialogue[]>(sortedDialogues);
  const [currentDialogueIndex, setCurrentDialogueIndex] = useState(0);
  const [currentDialogue, setCurrentDialogue] = useState<SrDirectorDialogue | null>(sortedDialogues[0] || null);
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

  // Update current dialogue when index changes
  useEffect(() => {
    const dialogue = dialoguesList[currentDialogueIndex];
    if (dialogue) {
      console.log('Updating dialogue:', {
        dialogueNumber: dialogue.dialogNumber,
        character: dialogue.character,
        timeStart: dialogue.timeStart,
        timeEnd: dialogue.timeEnd
      });
      
      setCurrentDialogue(dialogue);
      setDirectorNotes(dialogue.directorNotes || '');
      setRevisionRequested(dialogue.revisionRequested || false);
    }
  }, [currentDialogueIndex, dialoguesList]);

  const hasChanges = () => {
    if (!currentDialogue) return false;
    return (
      directorNotes !== (currentDialogue.directorNotes || '') ||
      revisionRequested !== (currentDialogue.revisionRequested || false)
    );
  };

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

  const handleDiscardChanges = () => {
    setShowConfirmation(false);
    if (currentDialogue) {
      setDirectorNotes(currentDialogue.directorNotes || '');
      setRevisionRequested(currentDialogue.revisionRequested || false);
    }
  };

  const handleApproveAndSave = async () => {
    if (!currentDialogue || !session) return;
    
    try {
      setIsSaving(true);
      
      console.log('Saving dialogue:', {
        dialogueNumber: currentDialogue.dialogNumber,
        projectId,
        updateData: {
          status: revisionRequested ? 'revision-requested' : 'approved',
          directorNotes,
          revisionRequested
        }
      });
      
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
      
      const { data: responseData } = await axios.patch(
        `/api/dialogues/${currentDialogue._id}`,
        updateData,
        {
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );

      console.log('Save response:', {
        status: 'success',
        dialogueId: responseData._id,
        updatedStatus: responseData.status
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
      console.error('Error saving review:', {
        error,
        dialogue: currentDialogue,
        projectContext: {
          projectId,
          dialogueId: currentDialogue._id,
          dialogueNumber: currentDialogue.dialogNumber
        }
      });
      
      setError(error instanceof Error ? error.message : 'Failed to save review');
      
      // Handle session expiration
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        router.push('/login');
      }
      
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsSaving(false);
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
    return <div className="text-center p-8">No dialogues available.</div>;
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-8 space-y-6">
      {/* Video Player Card */}
      <div className="bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700 overflow-hidden">
        <video
          ref={videoRef}
          src={currentDialogue.videoClipUrl}
          controls
          className="w-full"
        />
        
        {/* Video Controls */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-center gap-6">
            <div className="flex items-center gap-4">
              <button
                onClick={rewindFiveSeconds}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                -5s
              </button>
              <button
                onClick={togglePlayPause}
                className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                {isPlaying ? 'Pause' : 'Play'}
              </button>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-gray-600 dark:text-gray-300">Speed:</span>
              {[0.5, 0.75, 1, 1.25, 1.5].map((rate) => (
                <button
                  key={rate}
                  onClick={() => changePlaybackRate(rate)}
                  className={`px-3 py-2 rounded ${
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
      <div className="bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700">
        <div className="p-8 space-y-6">
          {/* Time Display */}
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-4">
              <span className="font-medium text-gray-900 dark:text-white">Start:</span>
              <p className="px-4 py-2 rounded-md border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white min-w-[120px] text-center">
                {currentDialogue.timeStart || '00:00.000'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-medium text-gray-900 dark:text-white">End:</span>
              <p className="px-4 py-2 rounded-md border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white min-w-[120px] text-center">
                {currentDialogue.timeEnd || '00:00.000'}
              </p>
            </div>
          </div>

          {/* All Text Versions */}
          <div className="grid grid-cols-3 gap-8">
            <div>
              <label className="block text-base font-medium mb-2 text-gray-900 dark:text-white">
                Original Text
              </label>
              <div className="w-full p-4 text-base rounded-lg border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                {currentDialogue.dialogue.original}
              </div>
            </div>
            <div>
              <label className="block text-base font-medium mb-2 text-gray-900 dark:text-white">
                Translated Text
              </label>
              <div className="w-full p-4 text-base rounded-lg border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                {currentDialogue.dialogue.translated}
              </div>
            </div>
            <div>
              <label className="block text-base font-medium mb-2 text-gray-900 dark:text-white">
                Adapted Text
              </label>
              <div className="w-full p-4 text-base rounded-lg border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                {currentDialogue.dialogue.adapted}
              </div>
            </div>
          </div>

          {/* Voice-over Player */}
          {currentDialogue.voiceOverUrl && (
            <div className="flex items-center justify-center py-4">
              <audio controls src={currentDialogue.voiceOverUrl} className="w-96" />
            </div>
          )}

          {/* Voice-over Notes Display */}
          {currentDialogue.voiceOverNotes && (
            <div>
              <label className="block text-base font-medium mb-2 text-gray-900 dark:text-white">
                Voice-over Notes
              </label>
              <div className="w-full p-4 text-base rounded-lg border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                {currentDialogue.voiceOverNotes}
              </div>
            </div>
          )}

          {/* Director Notes */}
          <div>
            <label htmlFor="directorNotes" className="block text-base font-medium mb-2 text-gray-900 dark:text-white">
              Director Notes
            </label>
            <textarea
              id="directorNotes"
              value={directorNotes}
              onChange={(e) => setDirectorNotes(e.target.value)}
              rows={4}
              className="w-full p-4 text-base rounded-lg border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="Add review notes, suggestions, or requirements..."
            />
          </div>

          {/* Revision Request Toggle */}
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="revisionRequested"
              checked={revisionRequested}
              onChange={(e) => setRevisionRequested(e.target.checked)}
              className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <label htmlFor="revisionRequested" className="text-base font-medium text-gray-900 dark:text-white">
              Request Revision
            </label>
          </div>

          {/* Navigation and Info */}
          <div className="flex items-center justify-center pt-6 mt-6 border-t border-gray-200 dark:border-gray-600">
            <div className="text-center">
              <div className="text-base font-medium text-gray-900 dark:text-white">
                Dialogue {currentDialogueIndex + 1} of {dialoguesList.length}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {currentDialogue.timeStart} - {currentDialogue.timeEnd}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl max-w-xl w-full">
            <h3 className="text-xl font-semibold mb-4">Unsaved Changes</h3>
            <p className="mb-6">You have unsaved changes. What would you like to do?</p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={handleDiscardChanges}
                className="px-6 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
              >
                Discard Changes
              </button>
              <button
                onClick={() => setShowConfirmation(false)}
                className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Keep Editing
              </button>
              <button
                onClick={handleApproveAndSave}
                disabled={isSaving}
                className="px-6 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : revisionRequested ? 'Request Revision' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Messages */}
      {isSaving && (
        <div className="fixed top-8 right-8 bg-blue-500 text-white px-6 py-3 rounded shadow-lg z-50">
          Saving review...
        </div>
      )}
      
      {showSaveSuccess && (
        <div className="fixed top-8 right-8 bg-green-500 text-white px-6 py-3 rounded shadow-lg z-50">
          Review saved successfully!
        </div>
      )}
      
      {error && (
        <div className="fixed top-8 right-8 bg-red-500 text-white px-6 py-3 rounded shadow-lg z-50">
          {error}
        </div>
      )}
    </div>
  );
} 