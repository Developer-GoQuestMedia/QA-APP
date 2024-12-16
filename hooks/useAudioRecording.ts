import { useState, useRef, useEffect } from 'react';
import { type Dialogue } from '../types/dialogue';
import { createWorker, createWavBlob, type AudioData } from '../utils/audio';

export const useAudioRecording = (currentDialogue: Dialogue) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<AudioData[]>([]);
  const [isPlayingRecording, setIsPlayingRecording] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const maxDurationRef = useRef<number>(0);

  // Reset recording duration when changing dialogues
  useEffect(() => {
    setRecordingDuration(0);
    setAudioBlob(null);
    if (audioBlobUrl) {
      URL.revokeObjectURL(audioBlobUrl);
      setAudioBlobUrl(null);
    }
    // Calculate max duration from dialogue times
    if (currentDialogue) {
      const parseTime = (time: string): number => {
        const [hours, minutes, seconds, milliseconds] = time.split(':').map(Number);
        return (hours * 3600) + (minutes * 60) + seconds + (milliseconds / 1000);
      };
      const startSeconds = parseTime(currentDialogue.timeStart);
      const endSeconds = parseTime(currentDialogue.timeEnd);
      maxDurationRef.current = Number((endSeconds - startSeconds).toFixed(3));
    }
  }, [currentDialogue, audioBlobUrl]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      if (audioBlobUrl) {
        URL.revokeObjectURL(audioBlobUrl);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [audioBlobUrl]);

  const startRecording = async () => {
    try {
      if (!window.AudioContext) {
        throw new Error('AudioContext is not supported in this browser');
      }

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
      setRecordingDuration(0);
      setRecordedChunks([]);
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const newDuration = prev + 0.1;
          if (newDuration >= maxDurationRef.current) {
            stopRecording();
            return maxDurationRef.current;
          }
          return newDuration;
        });
      }, 100);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (audioContextRef.current && sourceNodeRef.current && workletNodeRef.current) {
      sourceNodeRef.current.disconnect();
      workletNodeRef.current.disconnect();
      sourceNodeRef.current.mediaStream.getTracks().forEach(track => track.stop());
      
      if (recordedChunks.length === 0) {
        setIsRecording(false);
        return;
      }

      try {
        const combinedAudioData = recordedChunks.reduce((acc: Float32Array[], chunk) => {
          if (!chunk.audioData || chunk.audioData.length === 0) return acc;
          
          chunk.audioData.forEach((channel, i) => {
            if (!channel || channel.length === 0) return;
            
            const newArray = new Float32Array(
              acc[i] ? acc[i].length + channel.length : channel.length
            );
            if (acc[i]) {
              newArray.set(acc[i], 0);
            }
            newArray.set(channel, acc[i] ? acc[i].length : 0);
            acc[i] = newArray;
          });
          return acc;
        }, [] as Float32Array[]);

        if (combinedAudioData.length === 0 || !combinedAudioData[0] || combinedAudioData[0].length === 0) {
          throw new Error('No valid audio data recorded');
        }

        const wavBlob = createWavBlob(combinedAudioData, audioContextRef.current.sampleRate);
        setAudioBlob(wavBlob);
      } catch (error) {
        console.error('Error processing audio data:', error);
        throw error;
      }

      setIsRecording(false);
      setRecordedChunks([]);
    }
  };

  const handlePlayRecording = () => {
    if (!audioBlob) return;

    // Clean up old URL if it exists
    if (audioBlobUrl) {
      URL.revokeObjectURL(audioBlobUrl);
    }

    // Create new URL
    const newUrl = URL.createObjectURL(audioBlob);
    setAudioBlobUrl(newUrl);

    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio(newUrl);
      audioPlayerRef.current.onended = () => {
        setIsPlayingRecording(false);
      };
    } else {
      audioPlayerRef.current.src = newUrl;
    }

    if (isPlayingRecording) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      setIsPlayingRecording(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlayingRecording(true);
    }
  };

  return {
    audioBlob,
    isRecording,
    recordingDuration,
    isPlayingRecording,
    startRecording,
    stopRecording,
    handlePlayRecording,
    setAudioBlob,
    maxDuration: maxDurationRef.current
  };
}; 