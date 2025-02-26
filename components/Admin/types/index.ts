import { Project as BaseProject, ProjectStatus, Episode, AssignedUser } from '@/types/project';
import { UserRole, User } from '@/types/user';

// Extend the base Project type with additional fields
export interface Project extends BaseProject {
  _id: string;
  title: string;
  description: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  assignedTo: AssignedUser[];
  parentFolder: string;
  databaseName: string;
  collectionName: string;
  episodes: Episode[];
  index: string;
  uploadStatus: {
    totalFiles: number;
    completedFiles: number;
    currentFile: number;
    status: string;
  };
}

export type Tab = 'projects' | 'users';

export interface FilteredUsersLog {
  total: number;
  filtered: number;
  searchTerm: string;
  selectedCount: number;
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

export interface UserState {
  username: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
}

export interface UploadProgressData {
  phase: string;
  loaded: number;
  total: number;
  message?: string;
}

export interface UploadState {
  [key: string]: UploadProgressData;
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

export interface ProjectHandlers {
  handleCreateProject: () => Promise<void>;
  handleUpdateProject: (projectId: string) => Promise<void>;
  handleDeleteProject: (projectId: string) => Promise<void>;
  handleAssignUsers: () => Promise<void>;
}

export interface AdminViewProps {
  projects: Project[];
  refetchProjects: () => Promise<void>;
} 