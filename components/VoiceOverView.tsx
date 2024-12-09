'use client'

import { useState, useEffect, useRef } from 'react'
import { useSwipeable } from 'react-swipeable'
import { useSession } from 'next-auth/react'

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
  audioUrl?: string
  status: string
}

export default function VoiceOverView({ projects }: { projects: any[] }) {
  const { data: session } = useSession()
  const [currentDialogue, setCurrentDialogue] = useState<Dialogue | null>(null)
  const [dialogues, setDialogues] = useState<Dialogue[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [timer, setTimer] = useState(3)
  const [recordingTime, setRecordingTime] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (projects.length > 0) {
      fetchDialogues(projects[0]._id)
    }
  }, [projects])

  const fetchDialogues = async (projectId: string) => {
    const res = await fetch(`/api/dialogues?projectId=${projectId}`)
    const data = await res.json()
    setDialogues(data)
    if (data.length > 0) setCurrentDialogue(data[0])
  }

  const handlers = useSwipeable({
    onSwipedLeft: () => handleSwipe('next'),
    onSwipedRight: () => handleSwipe('prev'),
    preventDefaultTouchmoveEvent: true,
    trackMouse: true
  })

  const handleSwipe = (direction: 'next' | 'prev') => {
    if (!currentDialogue || !dialogues.length) return

    const currentIndex = dialogues.findIndex(d => d._id === currentDialogue._id)
    const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1

    if (newIndex >= 0 && newIndex < dialogues.length) {
      setCurrentDialogue(dialogues[newIndex])
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        await uploadAudio(audioBlob)
      }

      // Start 3-second countdown
      setTimer(3)
      const countdownInterval = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval)
            mediaRecorder.start()
            setIsRecording(true)
            startRecordingTimer()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (error) {
      console.error('Error accessing microphone:', error)
    }
  }

  const startRecordingTimer = () => {
    if (!currentDialogue) return
    const [hours, minutes, seconds, milliseconds] = currentDialogue.timeEnd.split(':').map(Number)
    const [startHours, startMinutes, startSeconds, startMilliseconds] = currentDialogue.timeStart.split(':').map(Number)
    
    const endTime = (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds
    const startTime = (startHours * 3600 + startMinutes * 60 + startSeconds) * 1000 + startMilliseconds
    const duration = endTime - startTime

    setTimeout(() => {
      stopRecording()
    }, duration)
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setRecordingTime(0)
    }
  }

  const uploadAudio = async (audioBlob: Blob) => {
    if (!currentDialogue) return

    const formData = new FormData()
    formData.append('audio', audioBlob, `recording_${currentDialogue._id}.wav`)
    formData.append('dialogueId', currentDialogue._id)

    try {
      const response = await fetch('/api/upload-audio', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        // Update dialogue list with new audio URL
        const updatedDialogues = dialogues.map(d => {
          if (d._id === currentDialogue._id) {
            return { ...d, status: 'recorded' }
          }
          return d
        })
        setDialogues(updatedDialogues)
      }
    } catch (error) {
      console.error('Error uploading audio:', error)
    }
  }

  if (!currentDialogue) {
    return <div>No dialogues available</div>
  }

  return (
    <div className="max-w-4xl mx-auto p-4" {...handlers}>
      <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
        <video
          ref={videoRef}
          src={currentDialogue.videoUrl}
          controls
          className="w-full mb-4"
        />
        
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold">Character</h3>
            <p>{currentDialogue.character}</p>
          </div>
          
          <div>
            <h3 className="font-semibold">Original</h3>
            <p>{currentDialogue.dialogue.original}</p>
          </div>
          
          <div>
            <h3 className="font-semibold">Translated</h3>
            <p>{currentDialogue.dialogue.translated}</p>
          </div>
          
          <div>
            <h3 className="font-semibold">Adapted</h3>
            <p>{currentDialogue.dialogue.adapted}</p>
          </div>
          
          <div className="flex justify-between items-center">
            {timer > 0 && !isRecording && (
              <div className="text-2xl font-bold text-center w-full">
                Starting in {timer}...
              </div>
            )}
            
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="bg-red-500 text-white px-4 py-2 rounded-full hover:bg-red-600 transition-colors"
              >
                Start Recording
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="bg-gray-500 text-white px-4 py-2 rounded-full hover:bg-gray-600 transition-colors"
              >
                Stop Recording
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between mt-4">
        <button
          onClick={() => handleSwipe('prev')}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
          disabled={dialogues.indexOf(currentDialogue) === 0}
        >
          Previous
        </button>
        <button
          onClick={() => handleSwipe('next')}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
          disabled={dialogues.indexOf(currentDialogue) === dialogues.length - 1}
        >
          Next
        </button>
      </div>
    </div>
  )
}

