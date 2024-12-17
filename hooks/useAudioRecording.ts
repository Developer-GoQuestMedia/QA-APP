import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { type Dialogue } from '../types/dialogue';
import { createWorker, createWavBlob, type AudioData } from '../utils/audio';

// Move constants outside component to prevent recreation
const AUDIO_CONFIG = {
  sampleRate: 48000,
  channelCount: 2,
  latencyHint: 'interactive' as const,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: false
} as const;

const logEvent = (message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development') {
    const timestamp = new Date().toISOString();
    // console.log(`[${timestamp}] ${message}`, data ? data : '');
  }
};

export const useAudioRecording = (currentDialogue: Dialogue) => {
  // Group related states to reduce re-renders
  const [recordingState, setRecordingState] = useState({
    isRecording: false,
    duration: 0,
    isPlaying: false
  });

  const [audioState, setAudioState] = useState({
    blob: null as Blob | null,
    blobUrl: null as string | null,
    chunks: [] as AudioData[]
  });

  // Use refs for values that don't need to trigger re-renders
  const refs = useRef({
    recordingTimer: null as NodeJS.Timeout | null,
    audioContext: null as AudioContext | null,
    workletNode: null as AudioWorkletNode | null,
    sourceNode: null as MediaStreamAudioSourceNode | null,
    audioPlayer: null as HTMLAudioElement | null,
    maxDuration: 0,
    stream: null as MediaStream | null,
    cleanupInProgress: false,
    stoppingInProgress: false
  });

  // Memoize parseTime function
  const parseTime = useMemo(() => {
    return (time: string): number => {
      const [hours, minutes, seconds, milliseconds] = time.split(':').map(Number);
      return (hours * 3600) + (minutes * 60) + seconds + (milliseconds / 1000);
    };
  }, []);

  // Memoize maxDuration calculation
  useEffect(() => {
    if (currentDialogue?.timeStart && currentDialogue?.timeEnd) {
      const startSeconds = parseTime(currentDialogue.timeStart);
      const endSeconds = parseTime(currentDialogue.timeEnd);
      refs.current.maxDuration = Number((endSeconds - startSeconds).toFixed(3));
    }
  }, [currentDialogue?.timeStart, currentDialogue?.timeEnd, parseTime]);

  const cleanup = useCallback(() => {
    if (refs.current.cleanupInProgress) return;
    refs.current.cleanupInProgress = true;
    
    try {
      logEvent('Cleaning up recording resources');
      
      // Clear timer
      if (refs.current.recordingTimer) {
        clearInterval(refs.current.recordingTimer);
        refs.current.recordingTimer = null;
      }

      // Stop audio playback
      if (refs.current.audioPlayer) {
        refs.current.audioPlayer.pause();
        refs.current.audioPlayer = null;
      }

      // Clean up blob URL
      if (audioState.blobUrl) {
        URL.revokeObjectURL(audioState.blobUrl);
        setAudioState(prev => ({ ...prev, blobUrl: null }));
      }

      // Stop and disconnect worklet
      if (refs.current.workletNode) {
        try {
          refs.current.workletNode.port.postMessage('stop');
          refs.current.workletNode.disconnect();
          refs.current.workletNode = null;
        } catch (error) {
          console.error('Error stopping worklet:', error);
        }
      }

      // Disconnect source
      if (refs.current.sourceNode) {
        try {
          refs.current.sourceNode.disconnect();
          refs.current.sourceNode = null;
        } catch (error) {
          console.error('Error disconnecting source:', error);
        }
      }

      // Stop media stream
      if (refs.current.stream) {
        try {
          refs.current.stream.getTracks().forEach(track => track.stop());
          refs.current.stream = null;
        } catch (error) {
          console.error('Error stopping media tracks:', error);
        }
      }

      // Close audio context
      if (refs.current.audioContext) {
        try {
          refs.current.audioContext.close();
          refs.current.audioContext = null;
        } catch (error) {
          console.error('Error closing audio context:', error);
        }
      }

      setRecordingState(prev => ({ ...prev, isRecording: false }));
      refs.current.stoppingInProgress = false;
    } catch (error) {
      console.error('Error during cleanup:', error);
    } finally {
      refs.current.cleanupInProgress = false;
    }
  }, [audioState.blobUrl]);

  const stopRecording = useCallback(() => {
    if (refs.current.stoppingInProgress) return;
    refs.current.stoppingInProgress = true;
    
    logEvent('Stopping recording', { chunksCount: audioState.chunks.length });
    
    if (refs.current.recordingTimer) {
      clearInterval(refs.current.recordingTimer);
      refs.current.recordingTimer = null;
    }

    if (refs.current.workletNode) {
      refs.current.workletNode.port.postMessage('stop');
    } else {
      cleanup();
    }
  }, [audioState.chunks.length, cleanup]);

  const startRecording = useCallback(async () => {
    try {
      logEvent('Starting recording');
      cleanup();
      setAudioState(prev => ({ ...prev, chunks: [], blob: null }));

      if (!window.AudioContext) {
        throw new Error('AudioContext not supported');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: AUDIO_CONFIG.echoCancellation,
          noiseSuppression: AUDIO_CONFIG.noiseSuppression,
          sampleRate: AUDIO_CONFIG.sampleRate,
          channelCount: AUDIO_CONFIG.channelCount,
          autoGainControl: AUDIO_CONFIG.autoGainControl
        } 
      });
      
      refs.current.stream = stream;
      refs.current.audioContext = new AudioContext({
        sampleRate: AUDIO_CONFIG.sampleRate,
        latencyHint: AUDIO_CONFIG.latencyHint
      });
      
      const sourceNode = refs.current.audioContext.createMediaStreamSource(stream);
      refs.current.sourceNode = sourceNode;

      const workletNode = await createWorker(refs.current.audioContext);
      refs.current.workletNode = workletNode;

      // Create a ref to store chunks during recording
      const recordingChunks = [] as AudioData[];

      // Set up event listeners
      workletNode.addEventListener('audiochunk', ((event: CustomEvent<AudioData>) => {
        const chunk = event.detail;
        recordingChunks.push(chunk);
        setAudioState(prev => ({ ...prev, chunks: [...prev.chunks, chunk] }));
        logEvent('Received audio chunk', { 
          channels: chunk.audioData.length,
          samplesPerChannel: chunk.audioData[0].length,
          peakLevel: chunk.peakLevel
        });
      }) as EventListener);

      workletNode.addEventListener('stopped', () => {
        if (recordingChunks.length === 0) {
          logEvent('No recorded chunks available');
          cleanup();
          return;
        }

        try {
          logEvent('Processing audio chunks', { 
            chunkCount: recordingChunks.length,
            firstChunkSize: recordingChunks[0]?.audioData?.[0]?.length
          });

          const combinedAudioData = recordingChunks.reduce((acc: Float32Array[], chunk) => {
            if (!chunk.audioData?.length) return acc;
            
            chunk.audioData.forEach((channel, i) => {
              if (!channel?.length) return;
              
              if (!acc[i]) {
                acc[i] = new Float32Array(channel.length);
                acc[i].set(channel);
              } else {
                const newArray = new Float32Array(acc[i].length + channel.length);
                newArray.set(acc[i], 0);
                newArray.set(channel, acc[i].length);
                acc[i] = newArray;
              }
            });
            return acc;
          }, []);

          if (!combinedAudioData.length || !combinedAudioData[0]?.length) {
            throw new Error('No valid audio data recorded');
          }

          if (!refs.current.audioContext) {
            throw new Error('AudioContext is not available');
          }

          const wavBlob = createWavBlob(combinedAudioData, refs.current.audioContext.sampleRate);
          logEvent('WAV blob created', { 
            size: wavBlob.size,
            channels: combinedAudioData.length,
            samplesPerChannel: combinedAudioData[0].length
          });
          setAudioState(prev => ({ ...prev, blob: wavBlob, chunks: [] }));
        } catch (error) {
          console.error('Error processing audio:', error);
          logEvent('Audio processing failed', { error });
          throw error;
        } finally {
          // Clear recording chunks
          recordingChunks.length = 0;
          cleanup();
        }
      });

      // Connect nodes
      sourceNode.connect(workletNode);
      workletNode.connect(refs.current.audioContext.destination);

      setRecordingState(prev => ({ ...prev, isRecording: true, duration: 0 }));
      
      refs.current.recordingTimer = setInterval(() => {
        setRecordingState(prev => {
          const newDuration = prev.duration + 0.1;
          if (newDuration >= refs.current.maxDuration) {
            stopRecording();
            return { ...prev, duration: refs.current.maxDuration };
          }
          return { ...prev, duration: newDuration };
        });
      }, 100);

      logEvent('Recording started');
    } catch (error) {
      console.error('Recording failed:', error);
      cleanup();
      throw error;
    }
  }, [cleanup, stopRecording]);

  const handlePlayRecording = useCallback(() => {
    if (!audioState.blob) {
      logEvent('Play recording attempted but no blob available');
      return;
    }

    if (recordingState.isPlaying) {
      logEvent('Stopping recording playback');
      if (refs.current.audioPlayer) {
        refs.current.audioPlayer.pause();
        refs.current.audioPlayer = null;
      }
      setRecordingState(prev => ({ ...prev, isPlaying: false }));
      return;
    }

    logEvent('Starting recording playback', {
      blobSize: audioState.blob.size,
      blobType: audioState.blob.type,
      hasExistingUrl: !!audioState.blobUrl
    });

    const audioUrl = URL.createObjectURL(audioState.blob);
    setAudioState(prev => ({ ...prev, blobUrl: audioUrl }));

    const audio = new Audio(audioUrl);
    refs.current.audioPlayer = audio;

    audio.addEventListener('loadstart', () => {
      logEvent('Audio loading started');
    });

    audio.addEventListener('canplay', () => {
      logEvent('Audio ready to play', {
        duration: audio.duration,
        sampleRate: refs.current.audioContext?.sampleRate
      });
    });

    audio.addEventListener('play', () => {
      logEvent('Audio playback started');
    });

    audio.addEventListener('pause', () => {
      logEvent('Audio playback paused');
    });

    audio.addEventListener('ended', () => {
      logEvent('Audio playback ended');
      setRecordingState(prev => ({ ...prev, isPlaying: false }));
      URL.revokeObjectURL(audioUrl);
      setAudioState(prev => ({ ...prev, blobUrl: null }));
    });

    audio.addEventListener('error', (e) => {
      const error = e.currentTarget as HTMLAudioElement;
      logEvent('Audio playback error', {
        error: error.error,
        networkState: error.networkState,
        readyState: error.readyState
      });
      setRecordingState(prev => ({ ...prev, isPlaying: false }));
      URL.revokeObjectURL(audioUrl);
      setAudioState(prev => ({ ...prev, blobUrl: null }));
    });

    audio.play().catch(error => {
      logEvent('Failed to start audio playback', { error: error.message });
      setRecordingState(prev => ({ ...prev, isPlaying: false }));
      URL.revokeObjectURL(audioUrl);
      setAudioState(prev => ({ ...prev, blobUrl: null }));
    });

    setRecordingState(prev => ({ ...prev, isPlaying: true }));
  }, [audioState.blob, recordingState.isPlaying]);

  // Reset state when dialogue changes
  useEffect(() => {
    if (!currentDialogue?._id) return;
    cleanup();
    setRecordingState({ isRecording: false, duration: 0, isPlaying: false });
    setAudioState({ blob: null, blobUrl: null, chunks: [] });
  }, [currentDialogue?._id, cleanup]);

  return {
    isRecording: recordingState.isRecording,
    recordingDuration: recordingState.duration,
    audioBlob: audioState.blob,
    isPlayingRecording: recordingState.isPlaying,
    startRecording,
    stopRecording,
    handlePlayRecording,
    hasRecording: !!audioState.blob || !!currentDialogue?.voiceOverUrl,
    setPlayingState: (isPlaying: boolean) => setRecordingState(prev => ({ ...prev, isPlaying }))
  };
}; 