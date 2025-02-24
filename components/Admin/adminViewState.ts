import { Project, Episode, ProjectStatus } from '@/types/project';
import { User } from '@/types/user';

export interface UploadProgressData {
  phase: 'pending' | 'uploading' | 'creating-collection' | 'processing' | 'success' | 'error';
  loaded: number;
  total: number;
  message?: string;
}

export interface UploadProgressState {
  [key: string]: UploadProgressData;
}

export interface AdminViewState {
  isProjectsLoading: boolean;
  loadError: string | null;
  selectedProject: Project | null;
  selectedUser: User | null;
  searchTerm: string;
  activeTab: string;
  viewMode: 'grid' | 'list';
  sortBy: 'title' | 'date' | 'status';
  filterStatus: ProjectStatus | 'all';
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
  uploadProgress: UploadProgressState;
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
  uploadProgress: {}
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
  })
}; 