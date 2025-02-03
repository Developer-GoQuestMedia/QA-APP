import { ObjectId } from 'mongodb'
import { User } from './user'

export type ProjectStatus = 'pending' | 'in-progress' | 'completed' | 'on-hold';

interface AssignedUser {
  username: string
  role: string
}

export interface Episode {
  _id: string | ObjectId; // Ensure _id is not optional
  name: string
  collectionName?: string                // optional
  videoPath?: string                     // optional
  videoKey?: string                      // optional
  status: 'uploaded' | 'processing' | 'error'
  uploadedAt?: Date
  step?: 1 | 2 | 3
  cleanedSpeechPath?: string
  cleanedSpeechKey?: string
  musicAndSoundEffectsPath?: string
  musicAndSoundEffectsKey?: string
}

export interface Project {
  dialogue_collection: any
  _id: ObjectId | string                 // can also be string or ObjectId
  title: string
  description: string
  sourceLanguage: string
  targetLanguage: string
  status: ProjectStatus
  assignedTo: AssignedUser[]
  updatedAt: string | Date
  createdAt?: string | Date
  parentFolder: string
  databaseName: string
  episodes: Episode[]
  uploadStatus: {
    totalFiles: number
    completedFiles: number
    currentFile: number
    status: string
  }
}

// Re-export the UserRole type from 'types/user'
export type { UserRole } from './user'
