import { Project as BaseProject, Episode as BaseEpisode, AssignedUser } from '@/types/project';
import { ObjectId } from 'mongodb';

// Convert ObjectId to string in our internal state
export interface Project {
  _id: string;
  title: string;
  description: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  assignedTo: Array<{
    _id: string;
    username: string;
    role: string;
    email?: string;
  }>;
  parentFolder: string;
  databaseName: string;
  collectionName: string;
  episodes: Array<{
    _id: string;
    name: string;
    status: string;
    steps: {
      audioExtraction?: {
        status: string;
        completedAt?: string;
        error?: string;
      };
      transcription?: {
        status: string;
        completedAt?: string;
        error?: string;
        transcriptionData?: {
          dialogues: Array<{
            subtitleIndex: number;
            dialogNumber: string;
            characterName: string;
            dialogue: {
              original: string;
            };
            startTime: number;
            endTime: number;
            videoClipUrl?: string;
          }>;
        };
      };
      translation?: {
        status: string;
        completedAt?: string;
        error?: string;
        translationData?: {
          dialogues: Array<{
            subtitleIndex: number;
            dialogNumber: string;
            characterName: string;
            dialogue: {
              original: string;
              translated: string;
            };
            startTime: number;
            endTime: number;
            videoClipUrl?: string;
          }>;
        };
      };
      voiceAssignment?: {
        status: string;
        completedAt?: string;
        error?: string;
        voiceData?: {
          dialogues: Array<{
            subtitleIndex: number;
            dialogNumber: string;
            characterName: string;
            dialogue: {
              original: string;
              translated: string;
            };
            startTime: number;
            endTime: number;
            videoClipUrl?: string;
            voiceModel?: string;
            voiceActor?: string;
          }>;
        };
      };
    };
    createdAt: string | Date;
    updatedAt: string | Date;
  }>;
  index: string;
  uploadStatus: {
    totalFiles: number;
    completedFiles: number;
    currentFile: number;
    status: string;
  };
}

export interface Episode {
  _id: string;
  name: string;
  status: string;
  steps: {
    audioExtraction?: {
      status: string;
      completedAt?: string;
      error?: string;
    };
    transcription?: {
      status: string;
      completedAt?: string;
      error?: string;
      transcriptionData?: {
        dialogues: Array<{
          subtitleIndex: number;
          dialogNumber: string;
          characterName: string;
          dialogue: {
            original: string;
          };
          startTime: number;
          endTime: number;
          videoClipUrl?: string;
        }>;
      };
    };
    translation?: {
      status: string;
      completedAt?: string;
      error?: string;
      translationData?: {
        dialogues: Array<{
          subtitleIndex: number;
          dialogNumber: string;
          characterName: string;
          dialogue: {
            original: string;
            translated: string;
          };
          startTime: number;
          endTime: number;
          videoClipUrl?: string;
        }>;
      };
    };
    voiceAssignment?: {
      status: string;
      completedAt?: string;
      error?: string;
      voiceData?: {
        dialogues: Array<{
          subtitleIndex: number;
          dialogNumber: string;
          characterName: string;
          dialogue: {
            original: string;
            translated: string;
          };
          startTime: number;
          endTime: number;
          videoClipUrl?: string;
          voiceModel?: string;
          voiceActor?: string;
        }>;
      };
    };
  };
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ProjectState {
  isLoading: boolean;
  error: string | null;
  selectedProject: Project | null;
  selectedProjectForTeam: Project | null;
  selectedProjectForEpisodes: Project | null;
  selectedEpisode: Episode | null;
  viewMode: 'grid' | 'list';
  sortBy: 'title' | 'date' | 'status';
  filterStatus: string | 'all';
  isCreating: boolean;
  isEditing: boolean;
  isAssigning: boolean;
  isEpisodesModalOpen: boolean;
  isEpisodeDetailsOpen: boolean;
  showDeleteConfirm: boolean;
  uploadProgress: Record<string, UploadProgressData>;
}

export interface UploadProgressData {
  phase: UploadPhase;
  loaded: number;
  total: number;
  message?: string;
}

export type UploadPhase = 'pending' | 'uploading' | 'creating-collection' | 'processing' | 'success' | 'error';

export const initialProjectState: ProjectState = {
  isLoading: false,
  error: null,
  selectedProject: null,
  selectedProjectForTeam: null,
  selectedProjectForEpisodes: null,
  selectedEpisode: null,
  viewMode: 'grid',
  sortBy: 'date',
  filterStatus: 'all',
  isCreating: false,
  isEditing: false,
  isAssigning: false,
  isEpisodesModalOpen: false,
  isEpisodeDetailsOpen: false,
  showDeleteConfirm: false,
  uploadProgress: {}
};

export const projectStateActions = {
  updateProjectState: (state: ProjectState, updates: Partial<Project>): ProjectState => {
    if (!state.selectedProject?._id) return state;

    return {
      ...state,
      selectedProject: {
        ...state.selectedProject,
        ...updates,
        _id: state.selectedProject._id,
        updatedAt: new Date().toISOString()
      }
    };
  },

  updateEpisodeState: (state: ProjectState, updates: Partial<Episode>): ProjectState => {
    if (!state.selectedEpisode?._id || !state.selectedProjectForEpisodes?._id) return state;

    return {
      ...state,
      selectedEpisode: {
        ...state.selectedEpisode,
        ...updates,
        _id: state.selectedEpisode._id
      }
    };
  },

  setSelectedProject: (state: ProjectState, project: Project | null): ProjectState => ({
    ...state,
    selectedProject: project,
    isEditing: false,
    showDeleteConfirm: false
  }),

  setSelectedEpisode: (state: ProjectState, episode: Episode | null): ProjectState => ({
    ...state,
    selectedEpisode: episode,
    isEpisodeDetailsOpen: !!episode
  }),

  updateUploadProgress: (
    state: ProjectState,
    progress: UploadProgressData
  ): ProjectState => ({
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

  setViewMode: (state: ProjectState, mode: 'grid' | 'list'): ProjectState => ({
    ...state,
    viewMode: mode
  }),

  setSortBy: (state: ProjectState, sortBy: 'title' | 'date' | 'status'): ProjectState => ({
    ...state,
    sortBy
  }),

  setFilterStatus: (state: ProjectState, filterStatus: string | 'all'): ProjectState => ({
    ...state,
    filterStatus
  }),

  setIsCreating: (state: ProjectState, isCreating: boolean): ProjectState => ({
    ...state,
    isCreating
  }),

  setIsEditing: (state: ProjectState, isEditing: boolean): ProjectState => ({
    ...state,
    isEditing
  }),

  setIsAssigning: (state: ProjectState, isAssigning: boolean): ProjectState => ({
    ...state,
    isAssigning
  }),

  setShowDeleteConfirm: (state: ProjectState, showDeleteConfirm: boolean): ProjectState => ({
    ...state,
    showDeleteConfirm
  })
}; 