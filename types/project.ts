import { ObjectId } from 'mongodb'
import { User } from './user'

export type ProjectStatus = 'pending' | 'in-progress' | 'completed' | 'on-hold';

interface AssignedUser {
  username: string
  role: string
}

export interface Episode {
  step: number;
  _id: string
  name: string
  collectionName: string
  videoPath?: string
  videoKey?: string
  status: 'uploaded' | 'processing' | 'error' | 'completed'
  uploadedAt?: Date
  steps?: {
    step1?: {
      cleanedSpeechPath?: string
      cleanedSpeechKey?: string
      musicAndSoundEffectsPath?: string
      musicAndSoundEffectsKey?: string
      status: 'pending' | 'processing' | 'completed' | 'error'
      updatedAt?: Date
    }
    step2?: {
      sceneData?: {
        scenes: Array<{
          id: string
          startTime: number
          endTime: number
          description: string
        }>
      }
      status: 'pending' | 'processing' | 'completed' | 'error'
      updatedAt?: Date
    }
    step3?: {
      videoClips?: Array<{
        id: string
        path: string
        key: string
        startTime: number
        endTime: number
      }>
      status: 'pending' | 'processing' | 'completed' | 'error'
      updatedAt?: Date
    }
    step4?: {
      translationData?: {
        dialogues: Array<{
          id: string
          text: string
          translation: string
          characterName: string
          startTime: number
          endTime: number
        }>
      }
      status: 'pending' | 'processing' | 'completed' | 'error'
      updatedAt?: Date
    }
    step5?: {
      characterVoices?: Array<{
        characterName: string
        voiceId: string
        voiceProvider: string
        settings?: Record<string, any>
      }>
      status: 'pending' | 'processing' | 'completed' | 'error'
      updatedAt?: Date
    }
    step6?: {
      voiceConversions?: Array<{
        dialogueId: string
        audioPath: string
        audioKey: string
        status: 'pending' | 'processing' | 'completed' | 'error'
      }>
      status: 'pending' | 'processing' | 'completed' | 'error'
      updatedAt?: Date
    }
    step7?: {
      mergedAudioPath?: string
      mergedAudioKey?: string
      status: 'pending' | 'processing' | 'completed' | 'error'
      updatedAt?: Date
    }
    step8?: {
      finalVideoPath?: string
      finalVideoKey?: string
      status: 'pending' | 'processing' | 'completed' | 'error'
      updatedAt?: Date
    }
  }
}

export interface Project {
  _id: string
  title: string
  description?: string
  status: 'completed' | 'in-progress' | 'on-hold' | 'pending'
  sourceLanguage: string
  targetLanguage: string
  episodes?: Episode[]
  assignedTo?: { username: string; role: string }[]
  databaseName?: string
  completedEpisodes?: number
  createdAt?: Date
  updatedAt?: Date
  parentFolder: string
  uploadStatus: {
    totalFiles: number
    completedFiles: number
    currentFile: number
    status: string
  }
  dialogue_collection?: any
  index?: string
  assignedUsers?: string[]
}

// Re-export the UserRole type from 'types/user'
export type { UserRole } from './user'
