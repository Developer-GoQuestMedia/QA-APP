import { Project } from '../state/projectState';
import { User } from '@/types/user';

export type Tab = 'projects' | 'users';

export interface AdminViewProps {
  projects: Project[];
  refetchProjects: () => Promise<void>;
}

export interface FilteredProject {
  _id: string;
  title: string;
  status: string;
  assignedTo: User[];
  createdAt: string;
  updatedAt: string;
}

export interface FilteredUsersLog {
  total: number;
  filtered: number;
  searchTerm: string;
  selectedCount: number;
}

export interface ProjectHandlers {
  handleCreateProject: () => Promise<void>;
  handleUpdateProject: (projectId: string) => Promise<void>;
  handleDeleteProject: (projectId: string) => Promise<void>;
  handleAssignUsers: () => Promise<void>;
}

export interface UserHandlers {
  handleCreateUser: () => Promise<void>;
  handleUpdateUser: (userId: string) => Promise<void>;
  handleDeleteUser: (userId: string) => Promise<void>;
}

export interface UserSelectionHandlers {
  handleUserSelection: (username: string) => void;
  handleRemoveUser: (projectId: string, username: string) => Promise<void>;
}

export interface TimeoutRefs {
  search?: NodeJS.Timeout;
  filter?: NodeJS.Timeout;
  [key: string]: NodeJS.Timeout | undefined;
}

export interface MemoizedData {
  filteredProjects: Project[];
  filteredUsers: User[];
  modalFilteredUsers: User[];
  projectHandlers: ProjectHandlers;
  userHandlers: UserHandlers;
  userSelectionHandlers: UserSelectionHandlers;
}

// Utility functions
export const formatBytes = (bytes: number, decimals: number = 2): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

export const getTimeStamp = (): string => {
  return new Date().toISOString();
};

export const ensureDate = (date: string | Date | undefined): string | Date => {
  if (!date) return new Date();
  return typeof date === 'string' ? new Date(date) : date;
}; 