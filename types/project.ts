export type ProjectStatus = 'pending' | 'in-progress' | 'completed' | 'on-hold';

interface AssignedUser {
  _id: string;
  username: string;
  email: string;
  role: string;
}

export interface Project {
  _id: string;
  title: string;
  description: string;
  sourceLanguage: string;
  targetLanguage: string;
  dialogue_collection: string;
  status: ProjectStatus;
  assignedTo: AssignedUser[];
  createdAt: string;
  updatedAt: string;
} 