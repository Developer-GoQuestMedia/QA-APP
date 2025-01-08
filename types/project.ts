import { User } from './user';

export type ProjectStatus = 'pending' | 'in-progress' | 'completed' | 'on-hold';

interface AssignedUser {
  username: string;
  role: string;
}

export interface Project {
  _id: string;
  title: string;
  description: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: ProjectStatus;
  videoPath?: string;
  folderPath?: string;
  dialogue_collection: string;
  assignedTo: AssignedUser[];
  updatedAt: string | Date;
  createdAt?: string | Date;
  
  // Episode specific fields
  episodeNumber: number;
  seasonNumber?: number;
  seriesTitle?: string;
  duration?: number; // in minutes
  originalAirDate?: string | Date;
  subtitleDeadline?: string | Date;
}

// Import and re-export the UserRole type from types/user
export type { UserRole } from './user'; 