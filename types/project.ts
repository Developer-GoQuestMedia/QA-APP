export interface Project {
  _id: string;
  title: string;
  description: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: string;
  assignedTo: Array<{
    username: string;
    role: string;
  }>;
  videoPath: string;
  dialogue_collection: string;
  updatedAt: Date;
  createdAt?: Date;
}

export type ProjectStatus = 'pending' | 'in-progress' | 'completed' | 'on-hold';
export type UserRole = 'transcriber' | 'translator' | 'voice-over' | 'director' | 'admin'; 