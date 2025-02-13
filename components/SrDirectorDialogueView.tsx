'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
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
  needsReRecord?: boolean;
}

interface DialogueViewProps {
  dialogues: BaseDialogue[]
  projectId: string
  project?: {
    databaseName: string;
    title: string;
  }
  episode?: {
    collectionName: string;
    name: string;
  }
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
  revisionRequested: dialogue.status === 'revision-requested',
  needsReRecord: dialogue.status === 'needs-rerecord'
});

export default function DirectorDialogueView({ dialogues: initialDialogues, projectId, project, episode }: DialogueViewProps) {
  // Initialize cache cleaner
  useCacheCleaner();

  // Memoize the adapted and sorted dialogues
  const { sortedDialogues, dialoguesList } = useMemo(() => {
    const adaptedDialogues = initialDialogues.map(adaptDialogue);
    const sorted = [...adaptedDialogues].sort((a, b) => 
      (a.subtitleIndex ?? 0) - (b.subtitleIndex ?? 0)
    );

    console.log('DirectorDialogueView - Initial state:', {
      totalDialogues: sorted.length,
      firstDialogue: sorted[0],
      lastDialogue: sorted[sorted.length - 1]
    });

    return {
      sortedDialogues: sorted,
      dialoguesList: sorted
    };
  }, [initialDialogues]);

  // State declarations
  const [currentDialogueIndex, setCurrentDialogueIndex] = useState(0);
  const [currentDialogue, setCurrentDialogue] = useState<DirectorDialogue | null>(() => sortedDialogues[0] || null);
  const [dialogues, setDialogues] = useState<DirectorDialogue[]>(dialoguesList);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [error, setError] = useState<string>('');
  const [directorNotes, setDirectorNotes] = useState('');
  const [revisionRequested, setRevisionRequested] = useState(false);
  const [needsReRecord, setNeedsReRecord] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queryClient = useQueryClient();
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [isSyncedPlaying, setIsSyncedPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  // Memoize hasChanges function first
  const hasChanges = useCallback(() => {
    if (!currentDialogue) return false;
    return (
      directorNotes !== (currentDialogue.directorNotes || '') ||
      revisionRequested !== (currentDialogue.revisionRequested || false) ||
      needsReRecord !== (currentDialogue.needsReRecord || false)
    );
  }, [currentDialogue, directorNotes, revisionRequested, needsReRecord]);

  // Then use it in the handlers
  const handleNext = useCallback(() => {
    if (hasChanges()) {
      setShowConfirmation(true);
    } else if (currentDialogueIndex < dialoguesList.length - 1) {
      setCurrentDialogueIndex(prev => prev + 1);
    }
  }, [currentDialogueIndex, dialoguesList.length, hasChanges]);

  const handlePrevious = useCallback(() => {
    if (currentDialogueIndex > 0) {
      if (hasChanges()) {
        setShowConfirmation(true);
      } else {
        setCurrentDialogueIndex(prev => prev - 1);
      }
    }
  }, [currentDialogueIndex, hasChanges]);

  // Add handleDiscardChanges function
  const handleDiscardChanges = useCallback(() => {
    setShowConfirmation(false);
    if (currentDialogue) {
      setDirectorNotes(currentDialogue.directorNotes || '');
      setRevisionRequested(currentDialogue.revisionRequested || false);
      setNeedsReRecord(currentDialogue.needsReRecord || false);
    }
  }, [currentDialogue]);

  // Update handleApproveAndSave to better handle dialogue ID
  const handleApproveAndSave = useCallback(async () => {
    if (!currentDialogue) {
      setError('No dialogue selected');
      return;
    }

    const dialogueId = currentDialogue.dialogNumber;
    if (!dialogueId) {
      console.error('Missing dialogue ID:', currentDialogue);
      setError('Invalid dialogue ID - Missing _id field');
      return;
    }

    if (!project?.databaseName || !episode?.collectionName) {
      setError('Missing required project or episode information');
      return;
    }
    
    try {
      setIsSaving(true);
      
      console.log('Saving dialogue:', {
        dialogueId,
        dialogueNumber: currentDialogue.dialogNumber,
        projectId,
        projectContext: {
          databaseName: project.databaseName,
          collectionName: episode.collectionName,
          projectId
        }
      });
      
      const dialogueComponents = dialogueId.split('.');
      const sceneNumber = dialogueComponents[2];
      
      const updateData = {
        _id: dialogueId,
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
        needsReRecord,
        databaseName: project.databaseName,
        collectionName: episode.collectionName,
        subtitleIndex: currentDialogue.subtitleIndex,
        characterName: currentDialogue.characterName,
        dialogNumber: currentDialogue.dialogNumber,
        projectId,
        sceneNumber
      };
      
      const { data: responseData } = await axios.patch(
        `/api/dialogues/update/${dialogueId}`,
        updateData,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          params: {
            databaseName: project.databaseName,
            collectionName: episode.collectionName,
            projectId
          }
        }
      );

      console.log('Save response:', {
        status: 'success',
        dialogueId: responseData.dialogNumber,
        updatedStatus: responseData.status,
        updatedDialogue: responseData
      });
      
      setDialogues(prevDialogues => 
        prevDialogues.map(d => 
          d.dialogNumber === currentDialogue.dialogNumber ? responseData : d
        )
      );

      queryClient.setQueryData(['dialogues', projectId], (oldData: QueryData | undefined) => {
        if (!oldData?.data) return oldData;
        return {
          ...oldData,
          data: oldData.data.map((d: BaseDialogue) => 
            d.dialogNumber === currentDialogue.dialogNumber ? responseData : d
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
  }, [currentDialogue, project, episode, projectId, directorNotes, revisionRequested, needsReRecord]);

  // Update current dialogue when index changes - with proper dependency array
  useEffect(() => {
    const dialogue = dialoguesList[currentDialogueIndex];
    if (dialogue && dialogue !== currentDialogue) {
      console.log('Updating dialogue:', {
        dialogueNumber: dialogue.dialogNumber,
        character: dialogue.character,
        timeStart: dialogue.timeStart,
        timeEnd: dialogue.timeEnd
      });
      
      setCurrentDialogue(dialogue);
      setDirectorNotes(dialogue.directorNotes || '');
      setRevisionRequested(dialogue.revisionRequested || false);
      setNeedsReRecord(dialogue.needsReRecord || false);
    }
  }, [currentDialogueIndex, dialoguesList]);

  // Handle synced playback
  const handleSyncedPlayback = async () => {
    if (!currentDialogue?.voiceOverUrl || !videoRef.current) return;

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

    try {
      // Create audio element
      const audio = new Audio(currentDialogue.voiceOverUrl);
      audioRef.current = audio;

      // Set up cleanup on audio end
      audio.addEventListener('ended', () => {
        setIsSyncedPlaying(false);
        setIsPlaying(false);
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.muted = false;
        }
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
        videoRef.current.muted = false;
      }
    }
  };

  // Update audio duration when dialogue changes
  useEffect(() => {
    const updateAudioDuration = async () => {
      if (!currentDialogue?.voiceOverUrl) {
        setAudioDuration(0);
        return;
      }

      try {
        const audio = new Audio(currentDialogue.voiceOverUrl);
        await new Promise((resolve) => {
          audio.addEventListener('loadedmetadata', () => {
            setAudioDuration(audio.duration);
            resolve(true);
          });
          audio.addEventListener('error', () => {
            setAudioDuration(0);
            resolve(false);
          });
        });
      } catch (error) {
        console.error('Error getting audio duration:', error);
        setAudioDuration(0);
      }
    };

    updateAudioDuration();
  }, [currentDialogue?.voiceOverUrl]);

  // Update video duration when video loads
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      const handleLoadedMetadata = () => {
        setVideoDuration(video.duration);
      };
      
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
    }
  }, [currentDialogue?.videoUrl]);

  // Clean up audio on unmount or dialogue change
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [currentDialogue?._id]);

  // Motion values for swipe animation
  const x = useMotionValue(0);
  const animControls = useAnimation();

  const handleDragEnd = async (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const SWIPE_THRESHOLD = 100;
    const velocity = Math.abs(info.velocity.x);
    const offset = Math.abs(info.offset.x);

    if (offset < SWIPE_THRESHOLD || velocity < 0.5) {
      await animControls.start({ x: 0, opacity: 1, scale: 1 });
      return;
    }

    const direction = info.offset.x > 0 ? 'right' : 'left';
    
    if (direction === 'left') {
      // Right to left swipe
      if (hasChanges()) {
        // Show confirmation modal for saving if there are changes
        await animControls.start({ 
          x: -200, 
          opacity: 0.5,
          scale: 0.95,
          transition: { duration: 0.2 }
        });
        setShowConfirmation(true);
        await animControls.start({ x: 0, opacity: 1, scale: 1 });
      } else if (currentDialogueIndex < dialoguesList.length - 1) {
        // If no changes, move to next dialogue
        await animControls.start({ 
          x: -200, 
          opacity: 0,
          scale: 0.95,
          transition: { duration: 0.2 }
        });
        setCurrentDialogueIndex(prev => prev + 1);
        await animControls.set({ x: 0, opacity: 1, scale: 1 });
      } else {
        // Reset animation if at the end
        await animControls.start({ x: 0, opacity: 1, scale: 1 });
      }
    } else if (direction === 'right' && currentDialogueIndex > 0) {
      // Left to right swipe - Go to previous dialogue
      if (hasChanges()) {
        await animControls.start({ 
          x: 200, 
          opacity: 0.5,
          scale: 0.95,
          transition: { duration: 0.2 }
        });
        setShowConfirmation(true);
        await animControls.start({ x: 0, opacity: 1, scale: 1 });
      } else {
        await animControls.start({ 
          x: 200, 
          opacity: 0,
          scale: 0.95,
          transition: { duration: 0.2 }
        });
        setCurrentDialogueIndex(prev => prev - 1);
        await animControls.set({ x: 0, opacity: 1, scale: 1 });
      }
    } else {
      // Reset animation if conditions not met
      await animControls.start({ x: 0, opacity: 1, scale: 1 });
    }
  };

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
        <div className="p-3 sm:p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
                  }
                }}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
              >
                -5s
              </button>
              <button
                onClick={() => {
                  if (videoRef.current) {
                    if (isPlaying) {
                      videoRef.current.pause();
                    } else {
                      videoRef.current.play();
                    }
                    setIsPlaying(!isPlaying);
                  }
                }}
                className="px-4 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
              >
                {isPlaying ? 'Pause' : 'Play'}
              </button>
            </div>
            {currentDialogue?.voiceOverUrl && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSyncedPlayback}
                  className="px-4 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm"
                >
                  {isSyncedPlaying ? 'Stop Synced' : 'Play with Audio'}
                </button>
                <div 
                  className={`w-3 h-3 rounded-full ${
                    Math.abs(audioDuration - videoDuration) < 0.1 
                      ? 'bg-green-500' 
                      : 'bg-red-500'
                  }`}
                  title={Math.abs(audioDuration - videoDuration) < 0.1 
                    ? 'Audio and video durations match' 
                    : `Duration mismatch - Video: ${videoDuration.toFixed(3)}s, Audio: ${audioDuration.toFixed(3)}s`}
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-300">Speed:</span>
              {[0.5, 0.75, 1, 1.25, 1.5].map((rate) => (
                <button
                  key={rate}
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.playbackRate = rate;
                      setPlaybackRate(rate);
                    }
                  }}
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
        style={{ x }}
        onDragEnd={handleDragEnd}
        whileTap={{ cursor: 'grabbing' }}
        whileHover={{ cursor: 'grab' }}
        transition={{ 
          type: "spring",
          stiffness: 300,
          damping: 30
        }}
      >
        <div className="p-5 space-y-4">
          {/* Time Display */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white">Start:</span>
              <p className="px-2 py-1 rounded-md border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white min-w-[100px] text-center">
                {currentDialogue?.timeStart || '00:00.000'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white">End:</span>
              <p className="px-2 py-1 rounded-md border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white min-w-[100px] text-center">
                {currentDialogue?.timeEnd || '00:00.000'}
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
                {currentDialogue?.dialogue.original}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">
                Translated Text
              </label>
              <div className="w-full p-2.5 text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                {currentDialogue?.dialogue.translated}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">
                Adapted Text
              </label>
              <div className="w-full p-2.5 text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                {currentDialogue?.dialogue.adapted}
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

          {/* Revision Request and Re-record Toggles */}
          <div className="flex items-center space-x-6">
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

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="needsReRecord"
                checked={needsReRecord}
                onChange={(e) => setNeedsReRecord(e.target.checked)}
                className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <label htmlFor="needsReRecord" className="text-sm font-medium text-gray-900 dark:text-white">
                Needs Re-record
              </label>
            </div>
          </div>

          {/* Navigation and Info */}
          <div className="flex items-center justify-center pt-4 mt-4 border-t border-gray-200 dark:border-gray-600">
            <div className="text-center">
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                Dialogue {currentDialogueIndex + 1} of {dialoguesList.length}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {currentDialogue?.timeStart} - {currentDialogue?.timeEnd}
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