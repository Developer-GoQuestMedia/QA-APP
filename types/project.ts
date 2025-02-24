import { ObjectId } from 'mongodb'
import { User } from './user'

export type ProjectStatus = 'pending' | 'in-progress' | 'completed' | 'on-hold';

export interface AssignedUser {
  username: string
  role: string
}

export interface Episode {
  _id: string;
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
    audioExtraction: {
      status: 'pending' | 'processing' | 'completed' | 'error';
      extracted_speechPath?: string;
      extracted_speechKey?: string;
      extracted_musicPath?: string;
      extracted_musicKey?: string;
      updatedAt?: string | Date;
      error?: string;
    };
    transcription: {
      status: 'pending' | 'processing' | 'completed' | 'error';
      transcriptionData?: {
        dialogues: Array<{
          id: string;
          text: string;
          characterName: string;
          startTime: number;
          endTime: number;
          videoClipUrl?: string;
        }>;
      };
      updatedAt?: string | Date;
      error?: string;
    };
    videoClips: {
      status: 'pending' | 'processing' | 'completed' | 'error';
      clips?: Array<{
        id: string;
        path: string;
        key: string;
        startTime: number;
        endTime: number;
        dialogueId?: string;
      }>;
      updatedAt?: string | Date;
      error?: string;
    };
    translation: {
      status: 'pending' | 'processing' | 'completed' | 'error';
      translationData?: {
        dialogues: Array<{
          id: string;
          originalText: string;
          translatedText: string;
          adaptedText?: string;
          characterName: string;
          startTime: number;
          endTime: number;
          videoClipUrl?: string;
        }>;
      };
      updatedAt?: string | Date;
      error?: string;
    };
    voiceAssignment: {
      status: 'pending' | 'processing' | 'completed' | 'error';
      characterVoices?: Array<{
        characterName: string;
        voiceId: string;
        voiceProvider: string;
        settings?: {
          stability?: number;
          similarity_boost?: number;
          style?: number;
          use_speaker_boost?: boolean;
        };
      }>;
      voiceConversions?: Array<{
        dialogueId: string;
        audioPath?: string;
        audioKey?: string;
        status: 'pending' | 'processing' | 'completed' | 'error';
        error?: string;
      }>;
      updatedAt?: string | Date;
      error?: string;
    };
  };
  updatedAt?: string | Date;
  lastModified?: string | Date;
}

export interface Project {
  _id: ObjectId | string
  title: string
  description: string
  sourceLanguage: string
  targetLanguage: string
  status: string
  createdAt: string | Date
  updatedAt: string | Date
  assignedTo: AssignedUser[]
  parentFolder: string
  databaseName: string
  collectionName: string
  episodes: Episode[]
  uploadStatus: {
    totalFiles: number
    completedFiles: number
    currentFile: number
    status: string
  }
  index: string
}

// Re-export the UserRole type from 'types/user'
export type { UserRole } from './user'
