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
  status: 'uploaded' | 'processing' | 'error'
  uploadedAt?: Date
}

export interface Project {
  _id: string
  title: string
  description: string
  sourceLanguage: string
  targetLanguage: string
  status: ProjectStatus
  assignedTo: AssignedUser[]
  updatedAt: Date | string
  createdAt: Date | string
  parentFolder: string
  databaseName: string
  episodes: Episode[]
  uploadStatus: {
    totalFiles: number
    completedFiles: number
    currentFile: number
    status: string
  }
  dialogue_collection?: any
  index?: string
}

// Re-export the UserRole type from 'types/user'
export type { UserRole } from './user'
