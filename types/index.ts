import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      role: string;
      email: string | null;
      name?: string | null;
      image?: string | null;
      isAdmin: boolean;
      sessionId: string;
    } & DefaultSession['user']
  }

  interface User {
    id: string;
    username: string;
    role: string;
    email: string;
    isAdmin: boolean;
  }
}

export interface User {
  _id: string;
  username: string;
  email: string;
  role: string;
  isAdmin: boolean;
  isActive: boolean;
  lastLogin?: Date;
  assignedProjects?: string[];
}

export type AdminAction = {
  type: 'DELETE' | 'UPDATE' | 'CREATE';
  payload: any;
  userId: string;
}