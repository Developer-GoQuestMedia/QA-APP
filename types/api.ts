import { Session } from 'next-auth';

// Base API Response type
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

// Project related types
export interface Project {
  _id: string;
  title: string;
  description?: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: ProjectStatus;
  assignedTo: ProjectAssignment[];
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectStatus = 'draft' | 'in-progress' | 'review' | 'completed';

export interface ProjectAssignment {
  username: string;
  role: ProjectRole;
  assignedAt: Date;
}

export type ProjectRole = 'transcriber' | 'translator' | 'director' | 'voiceOver' | 'srDirector';

// Episode related types
export interface Episode {
  _id: string;
  name: string;
  projectId: string;
  status: EpisodeStatus;
  steps: EpisodeSteps;
  createdAt: Date;
  updatedAt: Date;
}

export type EpisodeStatus = 'pending' | 'in-progress' | 'review' | 'completed' | 'error';

export interface EpisodeSteps {
  step1: StepStatus;
  step2: StepStatus;
  step3: StepStatus;
  step4: StepStatus;
  step5: StepStatus;
  step6: StepStatus;
}

export interface StepStatus {
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

// Dialogue related types
export interface Dialogue {
  _id: string;
  dialogNumber: string;
  characterName: string;
  text: string;
  translation?: string;
  voiceId?: string;
  audioUrl?: string;
  status: DialogueStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type DialogueStatus = 'pending' | 'translated' | 'voice-assigned' | 'recorded' | 'completed';

// Auth related types
export interface AuthenticatedRequest extends Request {
  session?: Session;
}

// Voice processing types
export interface VoiceModel {
  id: string;
  name: string;
  language: string;
  gender: string;
  previewUrl?: string;
}

export interface VoiceProcessingJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: {
    audioUrl: string;
    duration: number;
  };
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Pagination types
export interface PaginatedResponse<T> extends ApiResponse {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Search/Filter types
export interface SearchParams {
  query?: string;
  filters?: Record<string, any>;
  sort?: {
    field: string;
    order: 'asc' | 'desc';
  };
  page?: number;
  limit?: number;
} 