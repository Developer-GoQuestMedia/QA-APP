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

export type UserRole = 
  | 'admin'
  | 'director'
  | 'voiceOver'
  | 'transcriber'
  | 'translator'; 