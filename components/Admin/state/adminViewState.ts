import { Project as BaseProject, Episode } from '@/types/project';
import { User } from '@/types/user';

export interface Project extends BaseProject {
  videoFiles?: File[];
}

export type UploadPhase = 
  | 'initializing'
  | 'pending'
  | 'uploading' 
  | 'creating-collection'
  | 'processing'
  | 'success'
  | 'error';

export interface UploadProgressData {
  phase: UploadPhase;
  loaded: number;
  total: number;
  message?: string;
}

export interface UploadSpeedStats {
  bytesPerSecond: number;
  estimatedTimeRemaining: number;
  lastUpdateTime: number;
  totalBytesUploaded: number;
}

export interface FileUploadState {
  id: string;
  file: File;
  progress: number;
  status: 'queued' | 'uploading' | 'paused' | 'completed' | 'error' | 'retrying';
  error?: string;
  retryCount: number;
  speedStats: UploadSpeedStats;
  checksum?: string;
}

export interface UploadQueueState {
  files: FileUploadState[];
  activeUploads: number;
  isPaused: boolean;
  maxConcurrentUploads: number;
  totalProgress: number;
  overallSpeedStats: UploadSpeedStats;
}

export interface AdminViewState {
  isProjectsLoading: boolean;
  loadError: string | null;
  selectedProject: Project | null;
  selectedUser: User | null;
  searchTerm: string;
  activeTab: 'projects' | 'users';
  viewMode: 'grid' | 'list';
  sortBy: 'title' | 'date' | 'status';
  filterStatus: string | 'all';
  selectedProjectForTeam: Project | null;
  selectedProjectForEpisodes: Project | null;
  selectedEpisode: Episode | null;
  selectedUsernames: string[];
  isCreating: boolean;
  isCreatingUser: boolean;
  isEditing: boolean;
  isAssigning: boolean;
  isEpisodesModalOpen: boolean;
  isEpisodeDetailsOpen: boolean;
  showDeleteConfirm: boolean;
  showUserDeleteConfirm: boolean;
  error: string;
  success: string;
  assignUserSearchTerm: string;
  filteredUsers: User[];
  modalFilteredUsers: User[];
  uploadProgress: Record<string, UploadProgressData>;
  uploadQueue: UploadQueueState;
  uploadValidation: {
    maxFileSize: number;
    allowedTypes: string[];
    maxTotalSize: number;
  };
}

export const initialState: AdminViewState = {
  isProjectsLoading: false,
  loadError: null,
  selectedProject: null,
  selectedUser: null,
  searchTerm: '',
  activeTab: 'projects',
  viewMode: 'grid',
  sortBy: 'date',
  filterStatus: 'all',
  selectedProjectForTeam: null,
  selectedProjectForEpisodes: null,
  selectedEpisode: null,
  selectedUsernames: [],
  isCreating: false,
  isCreatingUser: false,
  isEditing: false,
  isAssigning: false,
  isEpisodesModalOpen: false,
  isEpisodeDetailsOpen: false,
  showDeleteConfirm: false,
  showUserDeleteConfirm: false,
  error: '',
  success: '',
  assignUserSearchTerm: '',
  filteredUsers: [],
  modalFilteredUsers: [],
  uploadProgress: {},
  uploadQueue: {
    files: [],
    activeUploads: 0,
    isPaused: false,
    maxConcurrentUploads: 3,
    totalProgress: 0,
    overallSpeedStats: {
      bytesPerSecond: 0,
      estimatedTimeRemaining: 0,
      lastUpdateTime: 0,
      totalBytesUploaded: 0
    }
  },
  uploadValidation: {
    maxFileSize: 1024 * 1024 * 1024, // 1GB
    allowedTypes: ['video/mp4'],
    maxTotalSize: 10 * 1024 * 1024 * 1024 // 10GB
  }
};

export const stateActions = {
  updateUploadProgress: (
    state: AdminViewState,
    progress: UploadProgressData
  ): AdminViewState => ({
    ...state,
    uploadProgress: {
      ...state.uploadProgress,
      [progress.phase]: {
        phase: progress.phase,
        loaded: progress.loaded,
        total: progress.total,
        message: progress.message
      }
    }
  }),

  setAssignUserSearchTerm: (
    state: AdminViewState,
    term: string
  ): AdminViewState => ({
    ...state,
    assignUserSearchTerm: term,
    modalFilteredUsers: state.filteredUsers.filter(user =>
      user.username.toLowerCase().includes(term.toLowerCase())
    )
  }),

  handleUserSelection: (
    state: AdminViewState,
    username: string
  ): AdminViewState => ({
    ...state,
    selectedUsernames: state.selectedUsernames.includes(username)
      ? state.selectedUsernames.filter(u => u !== username)
      : [...state.selectedUsernames, username]
  }),

  setViewMode: (
    state: AdminViewState,
    mode: 'grid' | 'list'
  ): AdminViewState => ({
    ...state,
    viewMode: mode
  }),

  updateSelectedProject: (
    state: AdminViewState,
    updates: Partial<Project>
  ): AdminViewState => ({
    ...state,
    selectedProject: state.selectedProject
      ? { ...state.selectedProject, ...updates }
      : null
  }),

  updateSelectedEpisode: (
    state: AdminViewState,
    updates: Partial<Episode>
  ): AdminViewState => ({
    ...state,
    selectedEpisode: state.selectedEpisode
      ? { ...state.selectedEpisode, ...updates }
      : null
  }),

  setSelectedProject: (
    state: AdminViewState,
    project: Project | null
  ): AdminViewState => ({
    ...state,
    selectedProject: project,
    isEditing: false,
    showDeleteConfirm: false
  }),

  setSelectedEpisode: (
    state: AdminViewState,
    episode: Episode | null
  ): AdminViewState => ({
    ...state,
    selectedEpisode: episode,
    isEpisodeDetailsOpen: !!episode
  }),

  setError: (
    state: AdminViewState,
    error: string
  ): AdminViewState => ({
    ...state,
    error,
    success: ''
  }),

  setSuccess: (
    state: AdminViewState,
    success: string
  ): AdminViewState => ({
    ...state,
    success,
    error: ''
  }),

  updateFileProgress: (
    state: AdminViewState,
    fileId: string,
    progress: number,
    speedStats: Partial<UploadSpeedStats>
  ): AdminViewState => {
    const updatedFiles = state.uploadQueue.files.map(file => 
      file.id === fileId 
        ? { 
            ...file, 
            progress,
            speedStats: { ...file.speedStats, ...speedStats }
          }
        : file
    );

    const totalProgress = updatedFiles.reduce(
      (acc, file) => acc + (file.progress / updatedFiles.length),
      0
    );

    return {
      ...state,
      uploadQueue: {
        ...state.uploadQueue,
        files: updatedFiles,
        totalProgress,
        overallSpeedStats: calculateOverallSpeedStats(updatedFiles)
      }
    };
  },

  addFilesToQueue: (
    state: AdminViewState,
    newFiles: File[]
  ): AdminViewState => {
    const fileStates: FileUploadState[] = newFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      progress: 0,
      status: 'queued',
      retryCount: 0,
      speedStats: {
        bytesPerSecond: 0,
        estimatedTimeRemaining: 0,
        lastUpdateTime: Date.now(),
        totalBytesUploaded: 0
      }
    }));

    return {
      ...state,
      uploadQueue: {
        ...state.uploadQueue,
        files: [...state.uploadQueue.files, ...fileStates]
      }
    };
  },

  removeFileFromQueue: (
    state: AdminViewState,
    fileId: string
  ): AdminViewState => ({
    ...state,
    uploadQueue: {
      ...state.uploadQueue,
      files: state.uploadQueue.files.filter(file => file.id !== fileId)
    }
  }),

  setUploadPaused: (
    state: AdminViewState,
    isPaused: boolean
  ): AdminViewState => ({
    ...state,
    uploadQueue: {
      ...state.uploadQueue,
      isPaused
    }
  }),

  retryFailedUpload: (
    state: AdminViewState,
    fileId: string
  ): AdminViewState => {
    const updatedFiles = state.uploadQueue.files.map(file =>
      file.id === fileId
        ? {
            ...file,
            status: 'retrying' as const,
            retryCount: file.retryCount + 1,
            error: undefined
          }
        : file
    );

    return {
      ...state,
      uploadQueue: {
        ...state.uploadQueue,
        files: updatedFiles
      }
    };
  }
};

function calculateOverallSpeedStats(files: FileUploadState[]): UploadSpeedStats {
  const activeFiles = files.filter(
    file => file.status === 'uploading' || file.status === 'retrying'
  );
  
  if (activeFiles.length === 0) {
    return {
      bytesPerSecond: 0,
      estimatedTimeRemaining: 0,
      lastUpdateTime: Date.now(),
      totalBytesUploaded: 0
    };
  }

  const totalBytesPerSecond = activeFiles.reduce(
    (acc, file) => acc + file.speedStats.bytesPerSecond,
    0
  );

  const totalBytesUploaded = activeFiles.reduce(
    (acc, file) => acc + file.speedStats.totalBytesUploaded,
    0
  );

  const totalBytes = activeFiles.reduce(
    (acc, file) => acc + file.file.size,
    0
  );

  const remainingBytes = totalBytes - totalBytesUploaded;
  const estimatedTimeRemaining = totalBytesPerSecond > 0
    ? remainingBytes / totalBytesPerSecond
    : 0;

  return {
    bytesPerSecond: totalBytesPerSecond,
    estimatedTimeRemaining,
    lastUpdateTime: Date.now(),
    totalBytesUploaded
  };
} 