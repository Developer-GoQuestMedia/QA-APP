export type UserRole = 'transcriber' | 'translator' | 'voice-over' | 'director' | 'admin';

interface SessionLog {
  loginTime: string | Date;
  userAgent: string;
}

export interface User {
  _id: string;
  username: string;
  email: string;
  password?: string;
  role: UserRole;
  lastLogin?: string | Date;
  lastLogout?: string | Date | null;
  sessionsLog: SessionLog[];
  assignedProjects: string[];
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
} 