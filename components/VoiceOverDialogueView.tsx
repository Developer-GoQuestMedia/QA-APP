import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, useMotionValue, useTransform, useAnimation, type PanInfo } from 'framer-motion'
import { createWorker, createWavBlob, type AudioData } from '@/utils/audio'
import { type Dialogue } from '@/types/dialogue'

interface DialogueViewProps {
  dialogues: Dialogue[];
  projectId: string;
}

type QueryData = {
  data: Dialogue[];
  status: string;
  timestamp: number;
};

const getNumberValue = (mongoNumber: any): number => {
  if (typeof mongoNumber === 'object' && mongoNumber !== null) {
    if ('$numberInt' in mongoNumber) return Number(mongoNumber.$numberInt);
    if ('$numberDouble' in mongoNumber) return Number(mongoNumber.$numberDouble);
  }
  return Number(mongoNumber);
};

const autoResizeTextArea = (element: HTMLTextAreaElement) => {
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
};

const checkMediaSupport = () => {
  // We'll use our custom WAV recording regardless of browser support
  return 'audio/wav';
};

export default function VoiceOverDialogueView({ dialogues: initialDialogues, projectId }: DialogueViewProps) {
  const [dialoguesList, setDialoguesList] = useState(initialDialogues);
  const [currentDialogueIndex, setCurrentDialogueIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [error, setError] = useState<string>('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const queryClient = useQueryClient();
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [isImposedAudio, setIsImposedAudio] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const voiceOverSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const dragX = useMotionValue(0);
  const dragControls = useAnimation();
  const [recordedChunks, setRecordedChunks] = useState<AudioData[]>([]);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const currentDialogue = dialoguesList[currentDialogueIndex];

  // Check for unsaved changes
  const hasChanges = () => {
    if (!currentDialogue) return false;
    return (
      audioBlob !== null
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
      setAudioBlob(null);
    }
  };

  // Voice recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
          channelCount: 2
        } 
      });
      
      audioContextRef.current = new AudioContext({
        sampleRate: 44100,
        latencyHint: 'interactive'
      });
      const sourceNode = audioContextRef.current.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      const workletNode = await createWorker(audioContextRef.current);
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        setRecordedChunks(chunks => [...chunks, event.data]);
      };

      sourceNode.connect(workletNode);
      workletNode.connect(audioContextRef.current.destination);

      setIsRecording(true);
      setRecordedChunks([]);
      
      console.log('Recording started in WAV format');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setError(error instanceof Error ? error.message : 'Failed to access microphone');
    }
  };

  const stopRecording = () => {
    if (audioContextRef.current && sourceNodeRef.current && workletNodeRef.current) {
      sourceNodeRef.current.disconnect();
      workletNodeRef.current.disconnect();
      sourceNodeRef.current.mediaStream.getTracks().forEach(track => track.stop());
      
      // Combine all recorded chunks into a single audio buffer
      const combinedAudioData = recordedChunks.reduce((acc: Float32Array[], chunk) => {
        chunk.audioData.forEach((channel, i) => {
          // Create new array with proper size
          const newArray = new Float32Array(
            acc[i] ? acc[i].length + channel.length : channel.length
          );
          
          // Copy existing data if any
          if (acc[i]) {
            newArray.set(acc[i], 0);
          }
          
          // Add new data
          newArray.set(channel, acc[i] ? acc[i].length : 0);
          
          // Update accumulator
          acc[i] = newArray;
        });
        return acc;
      }, [] as Float32Array[]);

      // Convert to WAV and set as audioBlob
      const wavBlob = createWavBlob(combinedAudioData, audioContextRef.current.sampleRate);
      setAudioBlob(wavBlob);

      setIsRecording(false);
      setRecordedChunks([]);
    }
  };

  // Save changes with approval
  const handleApproveAndSave = async () => {
    if (!currentDialogue) return;
    
    try {
      setIsSaving(true);
      
      let voiceOverUrl = currentDialogue.voiceOverUrl;
      
      // Upload audio if new recording exists
      if (audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob);
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
      setAudioBlob(null);
      setTimeout(() => setShowSaveSuccess(false), 2000);

      if (currentDialogueIndex < dialoguesList.length - 1) {
        setCurrentDialogueIndex(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error saving voice-over:', error);
      setError(error instanceof Error ? error.message : 'Failed to save voice-over');
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
      setAudioBlob(null);
    }
  }, [currentDialogue])

  const handleDragEnd = async (event: any, info: PanInfo) => {
    const threshold = 100; // minimum distance for swipe
    const velocity = info.velocity.x;
    const offset = info.offset.x;

    if (Math.abs(velocity) >= 500 || Math.abs(offset) >= threshold) {
      if (velocity > 0 || offset > threshold) {
        // Swipe right - go to previous
        if (currentDialogueIndex > 0) {
          if (hasChanges()) {
            setShowConfirmation(true);
          } else {
            setCurrentDialogueIndex(prev => prev - 1);
          }
        }
      } else {
        // Swipe left - go to next
        if (currentDialogueIndex < dialoguesList.length - 1) {
          if (hasChanges()) {
            setShowConfirmation(true);
          } else {
            setCurrentDialogueIndex(prev => prev + 1);
          }
        }
      }
    }
    
    // Reset position
    await dragControls.start({ x: 0 });
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
      // Initialize audio context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      // Connect video audio to context
      if (!audioSourceRef.current) {
        audioSourceRef.current = audioContextRef.current.createMediaElementSource(videoRef.current);
        audioSourceRef.current.connect(audioContextRef.current.destination);
      }

      // Load and play voice-over audio
      let audioData: ArrayBuffer;
      if (audioBlob) {
        audioData = await audioBlob.arrayBuffer();
      } else if (currentDialogue.voiceOverUrl) {
        const response = await fetch(currentDialogue.voiceOverUrl);
        audioData = await response.arrayBuffer();
      } else {
        return;
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
      console.error('Error imposing audio:', error);
      setError('Failed to impose audio');
    }
  };

  // Add useEffect for video event listeners
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

  // Add cleanup effect
  useEffect(() => {
    return () => {
      // Cleanup audio context and sources on unmount
      voiceOverSourceRef.current?.stop();
      audioContextRef.current?.close();
    };
  }, []);

  // Handle video seeking
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleSeek = () => {
      if (isImposedAudio && voiceOverSourceRef.current) {
        // Restart voice-over from new position
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

  if (!currentDialogue) {
    return <div className="text-center p-4">No dialogues available.</div>
  }

  return (
    <div className="w-full h-screen flex flex-col bg-gray-900">
      {/* Header Section */}
      <div className="flex-shrink-0">
        {/* Character Info */}
        <div className="p-2 bg-gray-800">
          <div className="flex items-center justify-center gap-2">
            <span className="text-gray-400">Character:</span>
            <span className="text-white">{currentDialogue.character}</span>
          </div>
        </div>

        {/* Video Player */}
        <div className="relative">
          <video
            ref={videoRef}
            src={currentDialogue.videoUrl}
            className="w-full aspect-video max-h-[200px] object-contain bg-black"
          />
          {isVideoLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
            </div>
          )}
        </div>

        {/* Video Controls */}
        <div className="p-2 bg-gray-800 flex flex-col items-center gap-2">
          <div className="flex gap-2">
            <button
              onClick={togglePlayPause}
              className="px-4 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={toggleAudioImposition}
              disabled={!audioBlob && !currentDialogue.voiceOverUrl}
              className="px-4 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isImposedAudio ? 'Remove Voice-over' : 'Add Voice-over'}
            </button>
          </div>
          
          {/* Time Info */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Start:</span>
              <span className="text-white">{currentDialogue.timeStart}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">End:</span>
              <span className="text-white">{currentDialogue.timeEnd}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <motion.div 
        className="flex-grow overflow-y-auto"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        animate={dragControls}
        style={{ x: dragX }}
      >
        {/* Text Content */}
        <div className="space-y-4">
          <div>
            <span className="text-gray-400">Original Text:</span>
            <p className="text-white">{currentDialogue.dialogue.original}</p>
          </div>

          <div>
            <span className="text-gray-400">Translated Text:</span>
            <p className="text-white">{currentDialogue.dialogue.translated}</p>
          </div>

          <div>
            <span className="text-gray-400">Adapted Text:</span>
            <p className="text-white">{currentDialogue.dialogue.adapted}</p>
          </div>
        </div>

        {/* Emotions */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-gray-400">Primary Emotion:</span>
            <p className="text-white">
              {currentDialogue.emotions?.primary?.emotion ?? 'Not specified'} 
              {currentDialogue.emotions?.primary?.intensity !== undefined && 
                `(Intensity: ${getNumberValue(currentDialogue.emotions.primary.intensity)})`
              }
            </p>
          </div>
          <div>
            <span className="text-gray-400">Secondary Emotion:</span>
            <p className="text-white">
              {currentDialogue.emotions?.secondary?.emotion ?? 'Not specified'}
              {currentDialogue.emotions?.secondary?.intensity !== undefined && 
                `(Intensity: ${getNumberValue(currentDialogue.emotions.secondary.intensity)})`
              }
            </p>
          </div>
        </div>

        {/* Additional Information */}
        <div className="space-y-4">
          <div>
            <span className="text-gray-400">Direction:</span>
            <p className="text-white">{currentDialogue.direction}</p>
          </div>

          <div>
            <span className="text-gray-400">Scene Context:</span>
            <p className="text-white">{currentDialogue.sceneContext}</p>
          </div>

          <div>
            <span className="text-gray-400">Technical Notes:</span>
            <p className="text-white">{currentDialogue.technicalNotes ?? 'No technical notes'}</p>
          </div>

          <div>
            <span className="text-gray-400">Cultural Notes:</span>
            <p className="text-white">{currentDialogue.culturalNotes ?? 'No cultural notes'}</p>
          </div>

          <div>
            <span className="text-gray-400">Lip Movements:</span>
            <p className="text-white">{getNumberValue(currentDialogue.lipMovements)}</p>
          </div>
        </div>

        {/* Voice Recording Controls */}
        <div className="flex justify-center py-2">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`px-6 py-2 rounded-full ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-blue-500 hover:bg-blue-600'
            } text-white transition-colors`}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
        </div>
      </motion.div>

      {/* Footer */}
      <div className="flex-shrink-0 p-2 bg-gray-800 border-t border-gray-700">
        <div className="text-center text-sm text-gray-300">
          Dialogue {currentDialogueIndex + 1} of {dialoguesList.length}
        </div>
      </div>

      {/* Modals and Notifications */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4 text-white">Unsaved Changes</h3>
            <p className="mb-4 text-gray-300">You have unsaved changes. What would you like to do?</p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={handleDiscardChanges}
                className="px-4 py-2 text-gray-400 hover:text-white"
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
                {isSaving ? 'Saving...' : 'Save Voice-over'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Messages */}
      {isSaving && (
        <div className="fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded shadow-lg z-50">
          Saving voice-over...
        </div>
      )}
      
      {showSaveSuccess && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50">
          Voice-over saved successfully!
        </div>
      )}
      
      {error && (
        <div className="fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg z-50">
          {error}
        </div>
      )}
    </div>
  );
} 