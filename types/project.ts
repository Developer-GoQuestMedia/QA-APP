import { ObjectId } from 'mongodb'
import { User } from './user'

export type ProjectStatus = 'pending' | 'in-progress' | 'completed' | 'on-hold';

export interface AssignedUser {
  _id: string | ObjectId;
  username: string;
  role: string;
  email?: string;
}

export interface Episode {
  _id: string | ObjectId;
  name: string;
  collectionName: string;
  videoPath?: string;
  videoKey?: string;
  extracted_musicPath?: string;
  extracted_musicKey?: string;
  extracted_speechPath?: string;
  extracted_speechKey?: string;
  status: 'uploaded' | 'processing' | 'error' | 'completed';
  uploadedAt?: string | Date;
  sceneNumber?: string;
  sceneDiscription?: string;
  timeStart?: string;
  timeEnd?: string;
  dialogueCount?: number;
  dialogues?: Array<{
    dialogNumber: string;
    timeStart: number;
    timeEnd: number;
    subtitleIndex: number;
    videoClipUrl: string;
    characterName: string;
    dialogue: {
      original: string;
      translated: string;
      adapted: string;
    };
    emotions: {
      primary: {
        emotion: string;
        intensity: number;
      };
      secondary: {
        emotion: string;
        intensity: number;
      };
    };
    characterProfile: {
      age: string;
      gender: string;
      accents: string[];
      otherNotes: string;
    };
    tone: string;
    lipMovements: string;
    technicalNotes: string;
    culturalNotes: string;
    words: Array<{
      wordSequenceNumber: string;
      word: string;
      wordStartTimestamp: string;
      wordEndTimestamp: string;
      numberOfLipMovementsForThisWord: number;
    }>;
    status: 'approved' | 'revision-requested' | 'voice-over-added' | string;
    index: number;
    deleteVoiceOver?: boolean;
    recordedAudioUrl?: string;
    voiceOverUrl?: string | null;
    originalVoiceOverUrl?: string;
    directorNotes?: string | null;
    needsReRecord?: boolean;
    revisionRequested?: boolean;
    voiceOverNotes?: string | null;
    voiceId?: string | null;
    updatedAt?: string | Date;
    updatedBy?: string;
    lastModified?: string | Date;
  }>;
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
  lastModified?: string | Date;
}

export interface Project {
  _id: string | ObjectId;
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
  uploadStatus: {
    totalFiles: number;
    completedFiles: number;
    currentFile: number;
    status: string;
  };
  index: string;
}

// Re-export the UserRole type from 'types/user'
export type { UserRole } from './user'
