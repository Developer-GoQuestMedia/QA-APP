import { User } from './user';

export type ProjectStatus = 'pending' | 'in-progress' | 'completed' | 'on-hold';

interface AssignedUser {
  username: string;
  role: string;
}

export interface Episode {
  _id: string;
  name: string;
  collectionName: string;
  videoPath: string;
  videoKey: string;
  status: 'uploaded' | 'processing' | 'error';
  uploadedAt: Date;
}

export interface Project {
  dialogue_collection: any;
  _id: string;
  title: string;
  description: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: ProjectStatus;
  assignedTo: AssignedUser[];
  updatedAt: string | Date;
  createdAt?: string | Date;
  parentFolder: string;
  databaseName: string;
  episodes: Episode[];
  uploadStatus: {
    totalFiles: number;
    completedFiles: number;
    currentFile: number;
    status: string;
  };
}

// Import and re-export the UserRole type from types/user
export type { UserRole } from './user'; 