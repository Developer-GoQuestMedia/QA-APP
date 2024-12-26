export type UserRole = 'transcriber' | 'translator' | 'voice-over' | 'director' | 'admin';

export interface User {
  _id: string;
  username: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLogin: Date | null;
  lastLogout: Date | null;
  sessionsLog: any[];
  assignedProjects: string[];
  createdAt: string;
  updatedAt: string;
} 