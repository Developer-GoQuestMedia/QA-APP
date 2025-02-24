'use client';

import { useState, useMemo, useCallback, useEffect } from 'react'
import { Project, Episode as BaseEpisode } from '@/types/project'
import { ChevronRight, Loader2, ArrowUpDown, Filter, Trash2, Play, Pause, RefreshCw, AlertCircle, Mic, MicOff, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import axios from 'axios'
import { log } from 'console';
import { toast } from 'react-hot-toast';
import { ObjectId } from 'mongodb';

interface AdminEpisodeViewProps {
  project?: Project;
  episodeData?: BaseEpisode;
  onEpisodeClick?: (
    projectId: string,
    episodeName: string,
    episodeId: string,
    project: Project,
    episode: BaseEpisode
  ) => Promise<void>;
}

interface AudioExtractionStep {
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  startTime?: string;
  endTime?: string;
  extracted_speechPath?: string;
  extracted_speechKey?: string;
  extracted_musicPath?: string;
  extracted_musicKey?: string;
  updatedAt?: string;
}

interface TranscriptionStep {
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  startTime?: string;
  endTime?: string;
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
  updatedAt?: string;
}

interface VideoClipsStep {
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  startTime?: string;
  endTime?: string;
  clips?: Array<{
    id: string;
    path: string;
    key: string;
    startTime: number;
    endTime: number;
    dialogueId?: string;
  }>;
  updatedAt?: string;
}

interface TranslationStep {
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  startTime?: string;
  endTime?: string;
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
  updatedAt?: string;
}

interface VoiceAssignmentStep {
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  startTime?: string;
  endTime?: string;
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
  updatedAt?: string;
}

interface Episode extends BaseEpisode {
  dialogues: Array<Dialogue>;
  steps: {
    audioExtraction: AudioExtractionStep;
    transcription: TranscriptionStep;
    videoClips: VideoClipsStep;
    translation: TranslationStep;
    voiceAssignment: VoiceAssignmentStep;
  };
}

interface StepStatus {
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  startTime?: string;
  endTime?: string;
  updatedAt?: string;
}

interface Dialogue {
  _id: string;
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
  status: 'approved' | 'revision-requested' | 'voice-over-added' | 'pending';
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
  updatedAt?: string;
  updatedBy?: string;
  lastModified?: string;
}

interface Transcription {
  _id: string;
  text: string;
  timestamp: number;
}

interface Translation {
  _id: string;
  text: string;
  originalText: string;
}

interface EpisodeStats {
  totalSteps: number;
  completedSteps: number;
  percentComplete: number;
  status: string;
}

type StepKey = 'audioExtraction' | 'transcription' | 'videoClips' | 'translation' | 'voiceAssignment';

type DialogueStatus = 'approved' | 'revision-requested' | 'voice-over-added' | 'pending';

interface VideoClip {
  _id: string;
  startTime: number;
  endTime: number;
  url: string;
}

interface VoiceModel {
  id: string;
  name: string;
  language: string;
}

// Type the step configuration
const STEP_CONFIG: Record<StepKey, {
  title: string;
  description: string;
  api: string;
}> = {
  audioExtraction: {
    title: "Step 1: Extract Audio and SFX",
    description: "Separate speech and background audio from the video",
    api: "/api/process/extract-audio"
  },
  transcription: {
    title: "Step 2: Transcription",
    description: "Generate transcription from audio",
    api: "/api/process/transcribe"
  },
  videoClips: {
    title: "Step 3: Video Clips",
    description: "Create video clips",
    api: "/api/process/clips"
  },
  translation: {
    title: "Step 4: Translation",
    description: "Translate transcription",
    api: "/api/process/translate"
  },
  voiceAssignment: {
    title: "Step 5: Voice Assignment",
    description: "Assign voices to characters",
    api: "/api/process/voices"
  }
} as const;

// Add type guards
const isAudioExtractionStep = (step: any): step is Episode['steps']['audioExtraction'] => {
  return step && 'extracted_speechPath' in step;
};

const isTranscriptionStep = (step: any): step is Episode['steps']['transcription'] => {
  return step && 'transcriptionData' in step;
};

const isVideoClipsStep = (step: any): step is Episode['steps']['videoClips'] => {
  return step && 'clips' in step;
};

const isTranslationStep = (step: any): step is Episode['steps']['translation'] => {
  return step && 'translationData' in step;
};

const isVoiceAssignmentStep = (step: any): step is Episode['steps']['voiceAssignment'] => {
  return step && ('characterVoices' in step || 'voiceConversions' in step);
};

// Add dialogue status config
const DIALOGUE_STATUS_CONFIG: Record<DialogueStatus, {
  icon: LucideIcon;
  class: string;
  label: string;
}> = {
  'approved': {
    icon: CheckCircle2,
    class: 'text-green-500',
    label: 'Approved'
  },
  'revision-requested': {
    icon: AlertTriangle,
    class: 'text-yellow-500',
    label: 'Revision Requested'
  },
  'voice-over-added': {
    icon: Mic,
    class: 'text-blue-500',
    label: 'Voice Over Added'
  },
  'pending': {
    icon: XCircle,
    class: 'text-gray-500',
    label: 'Pending'
  }
} as const;

// Add R2 bucket check function
const checkR2Files = async (projectName: string, episodeName: string, files: string[]): Promise<{ exists: string[]; notFound: string[]; baseUrl: string } | null> => {
  // Input validation with detailed error messages
  if (!projectName) {
    const error = new Error('Project name is required');
    console.error('checkR2Files validation error:', { error, projectName });
    throw error;
  }

  if (!episodeName) {
    const error = new Error('Episode name is required');
    console.error('checkR2Files validation error:', { error, episodeName });
    throw error;
  }

  if (!Array.isArray(files)) {
    const error = new Error('Files must be an array');
    console.error('checkR2Files validation error:', { error, files });
    throw error;
  }

  try {
    // Log raw input
    console.log('checkR2Files raw input:', {
      projectName,
      episodeName,
      files
    });

    // Sanitize project name by trimming spaces and replacing invalid characters
    const sanitizedProjectName = projectName.trim().replace(/[^a-zA-Z0-9-_]/g, '_');
    const sanitizedEpisodeName = episodeName.trim().replace(/[^a-zA-Z0-9-_]/g, '_');

    // Log after sanitization
    console.log('checkR2Files sanitized input:', {
      originalProjectName: projectName,
      sanitizedProjectName,
      originalEpisodeName: episodeName,
      sanitizedEpisodeName,
      files
    });

    const params = new URLSearchParams();
    params.append('databaseName', sanitizedProjectName);
    params.append('collectionName', sanitizedEpisodeName);

    // Only append files if they are provided and valid
    if (files && files.length > 0) {
      files.forEach((file, index) => {
        if (typeof file !== 'string') {
          console.warn('Invalid file entry:', { index, file, type: typeof file });
          return;
        }

        const trimmedFile = file.trim();
        if (trimmedFile) {
          params.append('files[]', trimmedFile);
        } else {
          console.warn('Empty file name after trim:', { index, originalFile: file });
        }
      });
    }

    const url = `/api/r2/check-files?${params.toString()}`;
    console.log('Making R2 check request to:', {
      url,
      params: Object.fromEntries(params.entries())
    });

    try {
      const response = await axios.get(url);
      console.log('R2 check raw response:', response.data);

      const { exists, notFound, errors, baseUrl } = response.data;

      if (errors?.length > 0) {
        console.error('R2 check returned errors:', errors);
        throw new Error(`R2 check failed: ${errors.map((e: { error: string }) => e.error).join(', ')}`);
      }

      if (!baseUrl) {
        console.warn('R2 check response missing baseUrl');
      }

      // Validate response data
      if (!Array.isArray(exists)) {
        console.warn('R2 check response has invalid exists array:', exists);
      }
      if (!Array.isArray(notFound)) {
        console.warn('R2 check response has invalid notFound array:', notFound);
      }

      const result = {
        exists: Array.isArray(exists) ? exists : [],
        notFound: Array.isArray(notFound) ? notFound : [],
        baseUrl: baseUrl || ''
      };

      console.log('R2 check processed response:', result);
      return result;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Log detailed axios error information
        console.error('R2 check axios error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          headers: error.response?.headers,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            params: error.config?.params,
            headers: error.config?.headers
          }
        });

        // Throw a more informative error
        throw new Error(
          `R2 check failed (${error.response?.status}): ${error.response?.data?.error || error.response?.statusText || error.message
          }`
        );
      }

      // For non-axios errors, provide as much context as possible
      console.error('R2 check unexpected error:', {
        error,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      throw error;
    }
  } catch (error) {
    // Final error handler to ensure consistent error format
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during R2 check';
    console.error('R2 check failed:', {
      error,
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
    throw new Error(errorMessage);
  }
};

// Update DB with R2 file paths
const updateDBWithR2Paths = async (episodeId: string, r2Paths: {
  extracted_speechPath: string;
  extracted_speechKey: string;
  extracted_musicPath: string;
  extracted_musicKey: string;
}) => {
  try {
    const response = await axios.post('/api/episodes/update-paths', {
      episodeId,
      paths: r2Paths
    });
    return response.data;
  } catch (error) {
    console.error('Error updating DB with R2 paths:', error);
    throw error;
  }
};

// Update validateAudioExtraction to handle R2 errors better
const validateAudioExtraction = async (episode: Episode, currentProject?: Project): Promise<boolean> => {
  try {
    // Add detailed logging at the start of validation
    console.debug('Starting validateAudioExtraction with:', {
      hasEpisode: !!episode,
      episodeId: episode._id,
      episodeName: episode.name,
      hasProject: !!currentProject,
      projectId: currentProject?._id,
      projectTitle: currentProject?.title,
      videoKey: episode.videoKey,
      hasAudioExtraction: !!episode.steps?.audioExtraction
    });

    // Validate input parameters with detailed error messages
    if (!episode || !episode.name) {
      console.warn('Invalid episode data:', {
        hasEpisode: !!episode,
        episodeId: episode?._id,
        hasName: !!episode?.name
      });
      return false;
    }

    if (!currentProject?.title) {
      console.warn('Invalid project data:', {
        hasProject: !!currentProject,
        projectId: currentProject?._id,
        hasTitle: !!currentProject?.title
      });
      return false;
    }

    // Check video file
    if (!episode.videoKey) {
      console.warn('Missing video key:', {
        episodeId: episode._id,
        episodeName: episode.name,
        videoPath: episode.videoPath
      });
      return false;
    }

    // Define files to check
    const speechFile = `${episode.name}_extracted_speech.wav`;
    const musicFile = `${episode.name}_extracted_music.wav`;
    const filesToCheck = [speechFile, musicFile];

    try {
      console.log('Checking R2 files:', {
        projectTitle: currentProject.title,
        episodeName: episode.name,
        files: filesToCheck
      });

      const r2Result = await checkR2Files(
        currentProject.title,
        episode.name,
        filesToCheck
      ).catch(error => {
        console.error('R2 check failed:', {
          error,
          message: error instanceof Error ? error.message : 'Unknown error',
          projectTitle: currentProject.title,
          episodeName: episode.name,
          files: filesToCheck
        });
        throw error;
      });

      if (!r2Result) {
        console.warn('No R2 result returned');
        return false;
      }

      const { exists, notFound, baseUrl } = r2Result;

      // If files exist but not in DB, update DB
      if (exists.length > 0) {
        const needsUpdate = !episode.steps?.audioExtraction?.extracted_speechPath ||
          !episode.steps?.audioExtraction?.extracted_musicPath;

        if (needsUpdate) {
          const r2Paths: any = {};

          if (exists.includes(speechFile)) {
            r2Paths.extracted_speechPath = `${baseUrl}/${speechFile}`;
            r2Paths.extracted_speechKey = `${currentProject.title}/${episode.name}/${speechFile}`;
          }

          if (exists.includes(musicFile)) {
            r2Paths.extracted_musicPath = `${baseUrl}/${musicFile}`;
            r2Paths.extracted_musicKey = `${currentProject.title}/${episode.name}/${musicFile}`;
          }

          if (Object.keys(r2Paths).length > 0) {
            try {
              await updateDBWithR2Paths(episode._id, r2Paths);
              return false; // Trigger refresh
            } catch (error) {
              console.error('Failed to update DB:', {
                error,
                episodeId: episode._id,
                paths: r2Paths
              });
              throw error;
            }
          }
        }
      }

      return exists.length === filesToCheck.length;
    } catch (error) {
      console.error('validateAudioExtraction failed:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        episodeId: episode._id,
        episodeName: episode.name,
        projectTitle: currentProject.title
      });
      throw error;
    }
  } catch (error) {
    console.error('Validation error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      episodeId: episode?._id,
      episodeName: episode?.name
    });
    throw error;
  }
};

// Add validation functions
const validateTranscription = (episode: Episode): boolean => {
  if (episode.steps?.audioExtraction?.status !== 'completed') {
    throw new Error('Audio extraction must be completed before transcription.');
  }
  if (!episode.steps?.audioExtraction?.extracted_speechPath) {
    throw new Error('Cleaned speech audio not found.');
  }
  return true;
};

const validateVideoClips = (episode: Episode): boolean => {
  if (episode.steps?.transcription?.status !== 'completed') {
    throw new Error('Transcription must be completed before creating video clips.');
  }
  if (!episode.steps?.transcription?.transcriptionData?.dialogues?.length) {
    throw new Error('No dialogues found in transcription data.');
  }
  return true;
};

const validateTranslation = (episode: Episode): boolean => {
  if (episode.steps?.transcription?.status !== 'completed') {
    throw new Error('Transcription must be completed before translation.');
  }
  if (!episode.steps?.transcription?.transcriptionData?.dialogues?.length) {
    throw new Error('No dialogues found to translate.');
  }
  return true;
};

const validateVoiceAssignment = (episode: Episode): boolean => {
  if (episode.steps?.translation?.status !== 'completed') {
    throw new Error('Translation must be completed before voice assignment.');
  }
  if (!episode.steps?.translation?.translationData?.dialogues?.length) {
    throw new Error('No translated dialogues found.');
  }
  return true;
};

// Type definitions for handlers
interface StepHandlers {
  audioExtraction: (episode: Episode) => Promise<boolean>;
  transcription: (episode: Episode) => boolean;
  videoClips: (episode: Episode) => boolean;
  translation: (episode: Episode) => boolean;
  voiceAssignment: (episode: Episode) => boolean;
}

const handleBulkAction = (action: 'delete' | 'reprocess') => {
  // ... existing implementation
};

const isValidObjectId = (id: string): boolean => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

// Add a function to transform BaseEpisode to Episode
const transformToEpisode = (baseEpisode: BaseEpisode | undefined): Episode | undefined => {
  if (!baseEpisode) return undefined;

  // Create a properly typed dialogue array
  const typedDialogues: Dialogue[] = (baseEpisode.dialogues || []).map(d => {
    // Ensure status is one of the allowed values
    let status: DialogueStatus = 'pending';
    if (d.status === 'approved' || d.status === 'revision-requested' || d.status === 'voice-over-added') {
      status = d.status;
    }

    // Convert date fields to strings if they're Date objects
    const updatedAt = d.updatedAt ? (d.updatedAt instanceof Date ? d.updatedAt.toISOString() : d.updatedAt) : undefined;
    const lastModified = d.lastModified ? (d.lastModified instanceof Date ? d.lastModified.toISOString() : d.lastModified) : undefined;

    return {
      _id: d.dialogNumber || String(d.index), // Use dialogNumber or index as _id if not present
      dialogNumber: d.dialogNumber,
      timeStart: d.timeStart,
      timeEnd: d.timeEnd,
      subtitleIndex: d.subtitleIndex,
      videoClipUrl: d.videoClipUrl,
      characterName: d.characterName,
      dialogue: {
        original: d.dialogue?.original || '',
        translated: d.dialogue?.translated || '',
        adapted: d.dialogue?.adapted || ''
      },
      emotions: d.emotions || {
        primary: { emotion: '', intensity: 0 },
        secondary: { emotion: '', intensity: 0 }
      },
      characterProfile: d.characterProfile || {
        age: '',
        gender: '',
        accents: [],
        otherNotes: ''
      },
      tone: d.tone || '',
      lipMovements: d.lipMovements || '',
      technicalNotes: d.technicalNotes || '',
      culturalNotes: d.culturalNotes || '',
      words: d.words || [],
      status, // Use the properly typed status
      index: d.index,
      deleteVoiceOver: d.deleteVoiceOver,
      recordedAudioUrl: d.recordedAudioUrl,
      voiceOverUrl: d.voiceOverUrl,
      originalVoiceOverUrl: d.originalVoiceOverUrl,
      directorNotes: d.directorNotes,
      needsReRecord: d.needsReRecord,
      revisionRequested: d.revisionRequested,
      voiceOverNotes: d.voiceOverNotes,
      voiceId: d.voiceId,
      updatedAt,
      updatedBy: d.updatedBy,
      lastModified
    };
  });

  return {
    ...baseEpisode,
    dialogues: typedDialogues,
    steps: baseEpisode.steps || {
      audioExtraction: { status: 'pending' },
      transcription: { status: 'pending' },
      videoClips: { status: 'pending' },
      translation: { status: 'pending' },
      voiceAssignment: { status: 'pending' }
    }
  } as Episode;
};

// ... rest of the code remains the same ...
