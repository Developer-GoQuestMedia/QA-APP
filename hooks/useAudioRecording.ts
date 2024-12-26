//useAudioRecording.ts

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
  // Add new state for processing and countdown
  const [processingState, setProcessingState] = useState({
    isProcessing: false,
    countdown: 0,
    isWaitingForVoice: false
  });

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
    stoppingInProgress: false,
    countdownInterval: null as NodeJS.Timeout | null,
    maxDurationTimeout: null as NodeJS.Timeout | null
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

  // Add countdown functionality
  const startCountdown = useCallback(() => {
    setProcessingState(prev => ({ ...prev, countdown: 3 }));
    
    refs.current.countdownInterval = setInterval(() => {
      setProcessingState(prev => {
        if (prev.countdown <= 1) {
          if (refs.current.countdownInterval) {
            clearInterval(refs.current.countdownInterval);
          }
          return { ...prev, countdown: 0 };
        }
        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);
  }, []);

  const startRecording = useCallback(async () => {
    if (processingState.isProcessing) return;
    
    try {
      setProcessingState(prev => ({ ...prev, isProcessing: true }));
      cleanup();
      setAudioState(prev => ({ ...prev, chunks: [], blob: null }));

      // Start countdown
      startCountdown();
      await new Promise(resolve => setTimeout(resolve, 3000));

      setProcessingState(prev => ({ ...prev, isWaitingForVoice: true }));

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

      // Create analyzer for voice detection
      const analyser = refs.current.audioContext.createAnalyser();
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const sourceNode = refs.current.audioContext.createMediaStreamSource(stream);
      sourceNode.connect(analyser);
      refs.current.sourceNode = sourceNode;

      // Wait for voice input
      await new Promise((resolve) => {
        const checkAudio = () => {
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((acc, value) => acc + value, 0) / bufferLength;
          
          if (average > 20) { // Threshold for voice detection
            setProcessingState(prev => ({ ...prev, isWaitingForVoice: false }));
            resolve(true);
          } else {
            requestAnimationFrame(checkAudio);
          }
        };
        checkAudio();
      });

      const workletNode = await createWorker(refs.current.audioContext);
      refs.current.workletNode = workletNode;

      // Set up recording chunks
      const recordingChunks = [] as AudioData[];

      workletNode.addEventListener('audiochunk', ((event: CustomEvent<AudioData>) => {
        const chunk = event.detail;
        recordingChunks.push(chunk);
        setAudioState(prev => ({ ...prev, chunks: [...prev.chunks, chunk] }));
      }) as EventListener);

      workletNode.addEventListener('stopped', () => {
        if (recordingChunks.length === 0) {
          cleanup();
          return;
        }

        try {
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
          setAudioState(prev => ({ ...prev, blob: wavBlob, chunks: [] }));
        } catch (error) {
          console.error('Error processing audio:', error);
          throw error;
        } finally {
          recordingChunks.length = 0;
          cleanup();
        }
      });

      // Connect nodes for recording
      sourceNode.disconnect(); // Disconnect from analyzer
      sourceNode.connect(workletNode);
      workletNode.connect(refs.current.audioContext.destination);

      setRecordingState(prev => ({ ...prev, isRecording: true, duration: 0 }));
      
      // Set up max duration timeout
      refs.current.maxDurationTimeout = setTimeout(() => {
        stopRecording();
      }, refs.current.maxDuration * 1000);

      // Set up duration timer
      refs.current.recordingTimer = setInterval(() => {
        setRecordingState(prev => {
          const newDuration = Number((prev.duration + 0.01).toFixed(3));
          if (newDuration >= refs.current.maxDuration) {
            stopRecording();
            return { ...prev, duration: refs.current.maxDuration };
          }
          return { ...prev, duration: newDuration };
        });
      }, 10);

    } catch (error) {
      console.error('Recording failed:', error);
      cleanup();
      throw error;
    } finally {
      setProcessingState(prev => ({ 
        ...prev, 
        isProcessing: false,
        isWaitingForVoice: false 
      }));
    }
  }, [cleanup, stopRecording, startCountdown]);

  const handlePlayRecording = useCallback(() => {
    if (!audioState.blob) return;

    // If already playing, stop playback
    if (recordingState.isPlaying) {
      if (refs.current.audioPlayer) {
        refs.current.audioPlayer.pause();
        refs.current.audioPlayer = null;
      }
      setRecordingState(prev => ({ ...prev, isPlaying: false }));
      return;
    }

    let audioUrl: string | null = null;
    try {
      // Create new audio element and URL
      audioUrl = URL.createObjectURL(audioState.blob);
      const audio = new Audio(audioUrl);
      refs.current.audioPlayer = audio;

      // Set up event listeners
      const cleanup = () => {
        setRecordingState(prev => ({ ...prev, isPlaying: false }));
        refs.current.audioPlayer = null;
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
          audioUrl = null;
        }
      };

      audio.addEventListener('ended', cleanup);
      audio.addEventListener('error', () => {
        console.error('Audio playback error');
        cleanup();
      });

      // Start playback
      audio.play()
        .then(() => {
          setRecordingState(prev => ({ ...prev, isPlaying: true }));
        })
        .catch(error => {
          console.error('Failed to play audio:', error);
          cleanup();
        });
    } catch (error) {
      console.error('Error setting up audio playback:', error);
      setRecordingState(prev => ({ ...prev, isPlaying: false }));
      if (refs.current.audioPlayer) {
        refs.current.audioPlayer = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    }
  }, [audioState.blob, recordingState.isPlaying]);

  // Reset state when dialogue changes
  useEffect(() => {
    if (!currentDialogue?._id) return;
    cleanup();
    setRecordingState({ isRecording: false, duration: 0, isPlaying: false });
    setAudioState({ blob: null, blobUrl: null, chunks: [] });
  }, [currentDialogue?._id, cleanup]);

  // Add cleanup for countdown interval
  useEffect(() => {
    return () => {
      if (refs.current.countdownInterval) {
        clearInterval(refs.current.countdownInterval);
      }
      if (refs.current.maxDurationTimeout) {
        clearTimeout(refs.current.maxDurationTimeout);
      }
    };
  }, []);

  return {
    isRecording: recordingState.isRecording,
    recordingDuration: recordingState.duration,
    audioBlob: audioState.blob,
    isPlayingRecording: recordingState.isPlaying,
    isProcessing: processingState.isProcessing,
    countdown: processingState.countdown,
    isWaitingForVoice: processingState.isWaitingForVoice,
    startRecording,
    stopRecording,
    handlePlayRecording,
    hasRecording: !!audioState.blob || !!currentDialogue?.voiceOverUrl,
    setPlayingState: (isPlaying: boolean) => setRecordingState(prev => ({ ...prev, isPlaying })),
    audioStream: refs.current.stream
  };
}; 