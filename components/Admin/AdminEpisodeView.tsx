'use client';

import { useState, useMemo, useCallback, useEffect } from 'react'
import { Project, Episode } from '@/types/project'
import { ChevronRight, Loader2, ArrowUpDown, Filter, Trash2, Play, Pause, RefreshCw, AlertCircle, Mic, MicOff, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import axios from 'axios'
import { log } from 'console';
import { toast } from 'react-hot-toast';
import { ObjectId } from 'mongodb';

interface AdminEpisodeViewProps {
  project?: Project;
  episodeData?: Episode;
  onEpisodeClick?: (
    projectId: string,
    episodeName: string,
    episodeId: string,
    project: Project,
    episode: Episode
  ) => Promise<void>;
}

interface EpisodeStats {
  totalSteps: number;
  completedSteps: number;
  percentComplete: number;
  status: string;
}

type DialogueStatus = 'approved' | 'revision-requested' | 'voice-over-added';

const STEP_CONFIG = {
  audioExtraction: {
    title: 'Step 1: Extract Audio and SFX',
    description: 'Separate speech and background audio from the video',
    api: '/api/process/extract-audio'
  },
  transcription: {
    title: 'Step 2: Transcription',
    description: 'Generate transcriptions for the dialogue',
    api: '/api/process/transcribe'
  },
  videoClips: {
    title: 'Step 3: Video Clips',
    description: 'Cut video into individual dialogue clips',
    api: '/api/process/video-clips'
  },
  translation: {
    title: 'Step 4: Translation',
    description: 'Translate and adapt the dialogue',
    api: '/api/process/translate'
  },
  voiceAssignment: {
    title: 'Step 5: Voice Assignment',
    description: 'Assign and convert voice-overs',
    api: '/api/process/voice-assignment'
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
const validateAudioExtraction = async (episode: Episode, currentProject?: Project) => {
  try {
    // Add detailed logging at the start of validation
    console.debug('Starting validateAudioExtraction with:', {
      hasEpisode: !!episode,
      episodeId: episode?._id,
      episodeName: episode?.name,
      hasProject: !!currentProject,
      projectId: currentProject?._id,
      projectTitle: currentProject?.title,
      videoKey: episode?.videoKey,
      hasAudioExtraction: !!episode?.steps?.audioExtraction
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
const validateTranscription = (episode: Episode) => {
  if (episode.steps?.audioExtraction?.status !== 'completed') {
    throw new Error('Audio extraction must be completed before transcription.');
  }
  if (!episode.steps?.audioExtraction?.extracted_speechPath) {
    throw new Error('Cleaned speech audio not found.');
  }
  return true;
};

const validateVideoClips = (episode: Episode) => {
  if (episode.steps?.transcription?.status !== 'completed') {
    throw new Error('Transcription must be completed before creating video clips.');
  }
  if (!episode.steps?.transcription?.transcriptionData?.dialogues?.length) {
    throw new Error('No dialogues found in transcription data.');
  }
  return true;
};

const validateTranslation = (episode: Episode) => {
  if (episode.steps?.transcription?.status !== 'completed') {
    throw new Error('Transcription must be completed before translation.');
  }
  if (!episode.steps?.transcription?.transcriptionData?.dialogues?.length) {
    throw new Error('No dialogues found to translate.');
  }
  return true;
};

const validateVoiceAssignment = (episode: Episode) => {
  if (episode.steps?.translation?.status !== 'completed') {
    throw new Error('Translation must be completed before voice assignment.');
  }
  if (!episode.steps?.translation?.translationData?.dialogues?.length) {
    throw new Error('No translated dialogues found.');
  }
  return true;
};

export default function AdminEpisodeView({ project, episodeData, onEpisodeClick }: AdminEpisodeViewProps) {
  const [loadingEpisodeId, setLoadingEpisodeId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc'
  });
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Add state for stored project and episode data
  const [currentProject, setCurrentProject] = useState<Project | undefined>(project);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | undefined>(episodeData);

  // Effect to load data from sessionStorage if props are not provided
  useEffect(() => {
    if (!project || !episodeData) {
      try {
        const storedProject = sessionStorage.getItem('currentProject');
        const storedEpisode = sessionStorage.getItem('currentEpisode');

        if (storedProject) {
          const parsedProject = JSON.parse(storedProject);
          setCurrentProject(parsedProject);
          console.debug('Loaded project from sessionStorage:', parsedProject);
        }

        if (storedEpisode) {
          const parsedEpisode = JSON.parse(storedEpisode);
          setCurrentEpisode(parsedEpisode);
          console.debug('Loaded episode from sessionStorage:', parsedEpisode);
        }
      } catch (error) {
        console.error('Error loading data from sessionStorage:', error);
      }
    }
  }, [project, episodeData]);

  // Effect to update state when props change
  useEffect(() => {
    if (project) {
      setCurrentProject(project);
    }
    if (episodeData) {
      setCurrentEpisode(episodeData);
    }
  }, [project, episodeData]);

  // Add debug logging for project and episode data changes
  useEffect(() => {
    if (!currentProject) {
      console.debug('AdminEpisodeView: Project data is missing');
    } else if (!currentProject._id || !currentProject.title) {
      console.debug('AdminEpisodeView: Project data is incomplete:', currentProject);
    }

    if (!currentEpisode) {
      console.debug('AdminEpisodeView: Episode data is missing');
    } else if (!currentEpisode._id || !currentEpisode.name) {
      console.debug('AdminEpisodeView: Episode data is incomplete:', currentEpisode);
    }
  }, [currentProject, currentEpisode]);

  // Calculate episode statistics
  const calculateEpisodeStats = (episode: Episode): EpisodeStats => {
    const steps = episode.steps || {};
    const totalSteps = Object.keys(STEP_CONFIG).length;
    const completedSteps = Object.keys(STEP_CONFIG).reduce((count, key) => {
      const step = steps[key as keyof typeof STEP_CONFIG];
      return count + (step?.status === 'completed' ? 1 : 0);
    }, 0);

    return {
      totalSteps,
      completedSteps,
      percentComplete: totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0,
      status: episode.status || 'pending'
    };
  };
  // Add refresh function
  const refreshEpisodeData = async (): Promise<Episode | null> => {
    try {
      setIsRefreshing(true);
      const url = `/api/episodes/${currentEpisode?._id}?projectId=${currentProject?._id}`;

      const response = await axios.get(url);
      const refreshedEpisode = response.data?.episode;

      if (refreshedEpisode) {
        console.debug('Successfully refreshed episode data:', {
          episodeId: refreshedEpisode._id,
          episodeName: refreshedEpisode.name
        });
        return refreshedEpisode;
      }

      toast.error('Failed to refresh episode data');
      return null;
    } catch (error) {
      console.error('Error refreshing episode:', error);
      toast.error('Failed to refresh episode data');
      return null;
    } finally {
      setIsRefreshing(false);
    }
  };

  // Update handleRefreshClick
  const handleRefreshClick = async () => {
    const updatedEpisode = await refreshEpisodeData();
    if (updatedEpisode) {
      setCurrentEpisode(updatedEpisode);
      toast.success('Episode refreshed');
    }
  };

  // Add handleTranscriberClick
  const handleTranscriberClick = async () => {
    try {
      // Validate project data
      if (!currentProject) {
        console.error('Project data is missing');
        toast.error('Project data is missing');
        return;
      }

      if (!currentProject._id) {
        console.error('Project ID is missing');
        toast.error('Project ID is missing');
        return;
      }

      // Validate episode data
      if (!currentEpisode?.name) {
        console.error('Episode name is missing');
        toast.error('Episode name is missing');
        return;
      }

      // Log navigation attempt
      console.debug('Navigating to transcriber:', {
        projectId: currentProject._id,
        episodeName: currentEpisode.name
      });

      // Navigate to transcriber page
      const url = `/admin/project/${currentProject._id}/episodes/${encodeURIComponent(currentEpisode.name)}/transcriber`;
      window.location.href = url;

    } catch (error) {
      console.error('Navigation Error:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        projectData: currentProject,
        episodeData: currentEpisode
      });
      toast.error('Failed to open transcriber');
    }
  };

  // Update handleProcessStep to use currentProject and currentEpisode
  const handleProcessStep = async (stepKey: keyof Episode['steps']) => {
    if (!currentEpisode || processingStep) {
      console.debug('HandleProcessStep: Early return - episodeData or processingStep check failed', {
        hasEpisodeData: !!currentEpisode,
        processingStep
      });
      return;
    }

    // Add early validation for required data with detailed logging
    if (!currentProject) {
      console.warn('HandleProcessStep: Project is undefined or null');
      return;
    }

    if (!currentProject._id) {
      console.warn('HandleProcessStep: Project is missing _id');
      return;
    }

    if (!currentProject.title) {
      console.warn('HandleProcessStep: Project is missing title');
      return;
    }

    if (!currentEpisode._id) {
      console.warn('HandleProcessStep: Episode is missing _id');
      return;
    }

    if (!currentEpisode.name) {
      console.warn('HandleProcessStep: Episode is missing name');
      return;
    }

    // Refresh episode data before processing
    try {
      console.debug('HandleProcessStep: Refreshing episode data before processing');
      const refreshedEpisode = await refreshEpisodeData();
      if (!refreshedEpisode) {
        console.warn('HandleProcessStep: Failed to refresh episode data');
        return;
      }
      setCurrentEpisode(refreshedEpisode);

      // Log the step being processed with refreshed data
      console.debug('HandleProcessStep: Processing step with refreshed data', {
        stepKey,
        projectId: currentProject._id,
        projectTitle: currentProject.title,
        episodeId: refreshedEpisode._id,
        episodeName: refreshedEpisode.name,
        videoKey: refreshedEpisode.videoKey,
        currentStatus: refreshedEpisode.status
      });

      setProcessingStep(stepKey);
      try {
        // Log state before validation
        console.debug('State before validation:', {
          stepKey,
          hasRefreshedEpisode: !!refreshedEpisode,
          refreshedEpisodeData: refreshedEpisode,
          hasCurrentProject: !!currentProject,
          currentProjectData: currentProject
        });

        // Validate step prerequisites with refreshed episode data
        const validationFunctions = {
          audioExtraction: (episode: Episode) => {
            console.debug('Calling audioExtraction validation with:', {
              hasEpisode: !!episode,
              episodeData: episode
            });
            return validateAudioExtraction(episode, currentProject);
          },
          transcription: validateTranscription,
          videoClips: validateVideoClips,
          translation: validateTranslation,
          voiceAssignment: validateVoiceAssignment
        };

        const validate = validationFunctions[stepKey];
        if (validate) {
          // Ensure refreshedEpisode exists before validation
          if (!refreshedEpisode) {
            console.warn('RefreshedEpisode is undefined before validation');
            return;
          }

          console.debug('Starting validation for step:', {
            stepKey,
            hasRefreshedEpisode: !!refreshedEpisode,
            refreshedEpisodeId: refreshedEpisode._id
          });

          const validationResult = await validate(refreshedEpisode);

          // If validation returns false, it means there was an error or DB was updated
          if (validationResult === false) {
            await refreshEpisodeData();
            return;
          }
        }

        // Check if API endpoint exists
        const config = STEP_CONFIG[stepKey];
        if (!config?.api) {
          console.warn(`API endpoint not configured for ${stepKey}`);
          return;
        }

        // Special handling for audio extraction
        if (stepKey === 'audioExtraction') {
          try {
            if (!refreshedEpisode.videoKey) {
              console.warn('Video key not found in episode data');
              return;
            }

            // Check for specific files - using just the filenames
            const speechFile = `${refreshedEpisode.name}_extracted_speech.wav`;
            const musicFile = `${refreshedEpisode.name}_extracted_music.wav`;

            // Define files to check
            const filesToCheck = [speechFile, musicFile];

            console.log('Checking R2 files:', {
              projectName: currentProject.title,
              episodeName: refreshedEpisode.name,
              filesToCheck
            });

            const r2Files = await checkR2Files(currentProject.title, refreshedEpisode.name, filesToCheck);
            if (r2Files && r2Files.exists.length > 0) {
              console.warn('Audio files already exist. Refreshing data...', r2Files);
              await refreshEpisodeData();
              return;
            }
          } catch (error) {
            console.error('Error checking R2 files:', error);
            return;
          }
        }

        // Prepare request payload
        const payload = {
          projectId: currentProject._id,
          episodeId: refreshedEpisode._id,
          step: stepKey,
          // Add step-specific data
          ...(stepKey === 'audioExtraction' && {
            videoPath: refreshedEpisode.videoPath,
            videoKey: refreshedEpisode.videoKey,
            episodeName: refreshedEpisode.name
          }),
          ...(stepKey === 'transcription' && {
            audioPath: refreshedEpisode.steps?.audioExtraction?.extracted_speechPath,
            audioKey: refreshedEpisode.steps?.audioExtraction?.extracted_speechKey
          }),
          ...(stepKey === 'translation' && {
            dialogues: refreshedEpisode.steps?.transcription?.transcriptionData?.dialogues
          }),
          ...(stepKey === 'voiceAssignment' && {
            dialogues: refreshedEpisode.steps?.translation?.translationData?.dialogues,
            characterVoices: refreshedEpisode.steps?.voiceAssignment?.characterVoices
          })
        };

        // Log the payload for debugging
        console.debug(`${stepKey} payload:`, payload);

        // Validate payload before making request
        if (!payload.projectId || !payload.episodeId) {
          console.warn('Invalid payload: Missing required IDs');
          return;
        }

        // Make API request
        const response = await axios.post(config.api, payload);

        // Handle response
        if (response.data.success) {
          console.log(`${stepKey} processing initiated:`, response.data);
          await refreshEpisodeData(); // Refresh data after successful processing
        } else {
          console.warn(`Failed to process ${stepKey}:`, response.data.message);
        }
      } catch (error) {
        console.error(`Error processing ${stepKey}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        // You can add toast.error(errorMessage) here
      } finally {
        setProcessingStep(null);
      }
    } catch (error) {
      console.error('Error in handleProcessStep:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      // You can add toast.error(errorMessage) here
    }
  };

  // Function to render step status
  const renderStepStatus = (step: { status: string; error?: string }) => {
    const statusConfig = {
      completed: { class: 'bg-green-100 text-green-800 dark:bg-green-200 dark:text-green-900', text: 'Completed' },
      processing: { class: 'bg-blue-100 text-blue-800 dark:bg-blue-200 dark:text-blue-900', text: 'Processing' },
      error: { class: 'bg-red-100 text-red-800 dark:bg-red-200 dark:text-red-900', text: 'Error' },
      pending: { class: 'bg-gray-100 text-gray-800 dark:bg-gray-200 dark:text-gray-900', text: 'Pending' }
    };

    const config = statusConfig[step.status as keyof typeof statusConfig] || statusConfig.pending;

    return (
      <div className="flex items-center space-x-2">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.class}`}>
          {config.text}
        </span>
        {step.error && (
          <div className="group relative">
            <AlertCircle className="w-4 h-4 text-red-500 cursor-help" />
            <div className="absolute bottom-full mb-2 hidden group-hover:block w-48 p-2 bg-red-50 text-red-800 text-xs rounded shadow-lg">
              {step.error}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Function to render step action button
  const renderStepAction = (stepKey: keyof Episode['steps'], step?: { status: string }) => {
    if (!step || step.status === 'pending' || step.status === 'error') {
      return (
        <button
          onClick={() => handleProcessStep(stepKey)}
          disabled={!!processingStep}
          className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processingStep === stepKey ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            'Start'
          )}
        </button>
      );
    }

    if (step.status === 'processing') {
      return (
        <button
          disabled
          className="px-3 py-1 text-sm bg-yellow-500 text-white rounded opacity-50 cursor-not-allowed"
        >
          Processing...
        </button>
      );
    }

    return (
      <button
        onClick={() => handleProcessStep(stepKey)}
        disabled={!!processingStep}
        className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Reprocess
      </button>
    );
  };

  // If we're viewing a single episode
  if (currentEpisode) {
    const stats = calculateEpisodeStats(currentEpisode);
    const steps = currentEpisode.steps || {};

    return (
      <div className="p-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Episode Details
            </h2>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleTranscriberClick}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                <Mic className="w-4 h-4 mr-2" />
                Open Transcriber
              </button>
              <button
                onClick={handleRefreshClick}
                disabled={isRefreshing}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
                title="Refresh Episode"
              >
                <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${currentEpisode.status === 'uploaded'
                    ? 'bg-green-100 text-green-800 dark:bg-green-200 dark:text-green-900'
                    : currentEpisode.status === 'processing'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-200 dark:text-blue-900'
                      : currentEpisode.status === 'error'
                        ? 'bg-red-100 text-red-800 dark:bg-red-200 dark:text-red-900'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-200 dark:text-gray-900'
                  }`}>
                  {currentEpisode.status}
                </span>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  {currentEpisode.name}
                </h3>
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Last updated: {currentEpisode.updatedAt ?
                  formatDistanceToNow(new Date(currentEpisode.updatedAt), { addSuffix: true }) :
                  'Never'}
              </span>
            </div>

            {/* Progress Section */}
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Progress
              </h4>
              <div className="flex items-center space-x-3">
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${stats.percentComplete}%` }}
                  />
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400 min-w-[80px]">
                  {stats.completedSteps} / {stats.totalSteps} steps
                </span>
              </div>
            </div>

            {/* Steps Details */}
            <div className="mt-8 space-y-6">
              {/* Processing Steps */}
              {Object.entries(STEP_CONFIG).map(([key, config]) => {
                const step = steps[key as keyof Episode['steps']];

                return (
                  <div key={key} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                          {config.title}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {config.description}
                        </p>
                      </div>
                      <div className="flex items-center space-x-4">
                        {renderStepStatus(step || { status: 'pending' })}
                        {renderStepAction(key as keyof Episode['steps'], step)}
                      </div>
                    </div>

                    {/* Step-specific content */}
                    {step?.status === 'completed' && (
                      <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        {key === 'audioExtraction' && isAudioExtractionStep(step) && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600 dark:text-gray-300">Extracted Speech</span>
                              {step.extracted_speechPath && (
                                <audio src={step.extracted_speechPath} controls className="w-64" />
                              )}
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600 dark:text-gray-300">Music & SFX</span>
                              {step.extracted_musicPath && (
                                <audio src={step.extracted_musicPath} controls className="w-64" />
                              )}
                            </div>
                          </div>
                        )}

                        {key === 'transcription' && isTranscriptionStep(step) && step.transcriptionData && (
                          <div className="space-y-2">
                            {step.transcriptionData.dialogues.map((dialogue, index) => (
                              <div key={dialogue.id} className="flex items-start space-x-4 p-2 bg-white dark:bg-gray-600 rounded">
                                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                  {index + 1}.
                                </span>
                                <div className="flex-1">
                                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                                    {dialogue.characterName}
                                  </div>
                                  <div className="text-sm text-gray-600 dark:text-gray-300">
                                    {dialogue.text}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {dialogue.startTime}s - {dialogue.endTime}s
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {key === 'videoClips' && isVideoClipsStep(step) && step.clips && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {step.clips.map((clip) => (
                              <div key={clip.id} className="relative">
                                <video
                                  src={clip.path}
                                  className="w-full rounded"
                                  controls
                                />
                                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1">
                                  {clip.startTime}s - {clip.endTime}s
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {key === 'translation' && isTranslationStep(step) && step.translationData && (
                          <div className="space-y-2">
                            {step.translationData.dialogues.map((dialogue) => (
                              <div key={dialogue.id} className="p-2 bg-white dark:bg-gray-600 rounded">
                                <div className="flex justify-between mb-1">
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {dialogue.characterName}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {dialogue.startTime}s - {dialogue.endTime}s
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-sm text-gray-600 dark:text-gray-300">
                                    Original: {dialogue.originalText}
                                  </p>
                                  <p className="text-sm text-blue-600 dark:text-blue-300">
                                    Translated: {dialogue.translatedText}
                                  </p>
                                  {dialogue.adaptedText && (
                                    <p className="text-sm text-green-600 dark:text-green-300">
                                      Adapted: {dialogue.adaptedText}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {key === 'voiceAssignment' && isVoiceAssignmentStep(step) && (
                          <div className="space-y-4">
                            {step.characterVoices && (
                              <div className="space-y-2">
                                <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                                  Voice Assignments
                                </h4>
                                {step.characterVoices.map((voice) => (
                                  <div key={voice.characterName} className="flex items-center justify-between p-2 bg-white dark:bg-gray-600 rounded">
                                    <span className="text-sm text-gray-900 dark:text-white">
                                      {voice.characterName}
                                    </span>
                                    <span className="text-sm text-gray-600 dark:text-gray-300">
                                      Voice ID: {voice.voiceId}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {step.voiceConversions && (
                              <div className="space-y-2">
                                <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                                  Voice Conversions
                                </h4>
                                {step.voiceConversions.map((conversion) => (
                                  <div key={conversion.dialogueId} className="p-2 bg-white dark:bg-gray-600 rounded">
                                    {conversion.audioPath && (
                                      <audio src={conversion.audioPath} controls className="w-full" />
                                    )}
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      Status: {conversion.status}
                                      {conversion.error && (
                                        <span className="text-red-500 ml-2">{conversion.error}</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add Dialogue Section after Steps Details */}
            {currentEpisode.dialogues && currentEpisode.dialogues.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Dialogues ({currentEpisode.dialogueCount})
                </h3>

                <div className="space-y-4">
                  {currentEpisode.dialogues.map((dialogue) => {
                    const StatusIcon = DIALOGUE_STATUS_CONFIG[dialogue.status as DialogueStatus]?.icon || XCircle;
                    const statusClass = DIALOGUE_STATUS_CONFIG[dialogue.status as DialogueStatus]?.class || 'text-gray-500';

                    return (
                      <div key={dialogue.dialogNumber} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="flex items-center space-x-2">
                              <StatusIcon className={`w-5 h-5 ${statusClass}`} />
                              <h4 className="text-md font-medium text-gray-900 dark:text-white">
                                {dialogue.characterName}
                              </h4>
                              <span className="text-sm text-gray-500">
                                #{dialogue.dialogNumber}
                              </span>
                            </div>
                            <div className="mt-2 space-y-1">
                              <p className="text-sm text-gray-600 dark:text-gray-300">
                                Original: {dialogue.dialogue.original}
                              </p>
                              <p className="text-sm text-blue-600 dark:text-blue-300">
                                Translated: {dialogue.dialogue.translated}
                              </p>
                              {dialogue.dialogue.adapted && (
                                <p className="text-sm text-green-600 dark:text-green-300">
                                  Adapted: {dialogue.dialogue.adapted}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            {dialogue.recordedAudioUrl && (
                              <div className="flex flex-col items-end space-y-1">
                                <audio
                                  src={dialogue.recordedAudioUrl}
                                  controls
                                  className="w-48"
                                />
                                <span className="text-xs text-gray-500">
                                  Original Recording
                                </span>
                              </div>
                            )}
                            {dialogue.voiceOverUrl && (
                              <div className="flex flex-col items-end space-y-1">
                                <audio
                                  src={dialogue.voiceOverUrl}
                                  controls
                                  className="w-48"
                                />
                                <span className="text-xs text-gray-500">
                                  Voice Over
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Technical Details Collapsible */}
                        <details className="mt-2">
                          <summary className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900">
                            Technical Details
                          </summary>
                          <div className="mt-2 pl-4 space-y-2 text-sm">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <h5 className="font-medium text-gray-700 dark:text-gray-300">Timing</h5>
                                <p className="text-gray-600 dark:text-gray-400">
                                  {dialogue.timeStart}s - {dialogue.timeEnd}s
                                </p>
                              </div>
                              <div>
                                <h5 className="font-medium text-gray-700 dark:text-gray-300">Lip Movements</h5>
                                <p className="text-gray-600 dark:text-gray-400">
                                  Primary: {dialogue.emotions.primary.emotion} ({dialogue.emotions.primary.intensity})
                                  {dialogue.emotions.secondary.emotion !== 'Neutral' && (
                                    <>, Secondary: {dialogue.emotions.secondary.emotion} ({dialogue.emotions.secondary.intensity})</>
                                  )}
                                </p>
                              </div>
                              <div>
                                <h5 className="font-medium text-gray-700 dark:text-gray-300">Tone</h5>
                                <p className="text-gray-600 dark:text-gray-400">
                                  {dialogue.tone}
                                </p>
                              </div>
                              <div>
                                <h5 className="font-medium text-gray-700 dark:text-gray-300">Emotions</h5>
                                <p className="text-gray-600 dark:text-gray-400">
                                  Primary: {dialogue.emotions.primary.emotion} ({dialogue.emotions.primary.intensity})
                                  {dialogue.emotions.secondary.emotion !== 'Neutral' && (
                                    <>, Secondary: {dialogue.emotions.secondary.emotion} ({dialogue.emotions.secondary.intensity})</>
                                  )}
                                </p>
                              </div>
                            </div>

                            {dialogue.directorNotes && (
                              <div>
                                <h5 className="font-medium text-gray-700 dark:text-gray-300">Director Notes</h5>
                                <p className="text-gray-600 dark:text-gray-400">
                                  {dialogue.directorNotes}
                                </p>
                              </div>
                            )}

                            {dialogue.voiceOverNotes && (
                              <div>
                                <h5 className="font-medium text-gray-700 dark:text-gray-300">Voice Over Notes</h5>
                                <p className="text-gray-600 dark:text-gray-400">
                                  {dialogue.voiceOverNotes}
                                </p>
                              </div>
                            )}

                            {dialogue.words && dialogue.words.length > 0 && (
                              <div>
                                <h5 className="font-medium text-gray-700 dark:text-gray-300">Word Timing</h5>
                                <div className="mt-1 space-y-1">
                                  {dialogue.words.map((word) => (
                                    <div key={word.wordSequenceNumber} className="flex items-center justify-between text-xs">
                                      <span>{word.word}</span>
                                      <span className="text-gray-500">
                                        {word.wordStartTimestamp} - {word.wordEndTimestamp}
                                        <span className="ml-2">
                                          (Lip Movements: {word.numberOfLipMovementsForThisWord})
                                        </span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </details>

                        {/* Action Buttons */}
                        <div className="mt-4 flex justify-end space-x-2">
                          {dialogue.needsReRecord && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Needs Re-record
                            </span>
                          )}
                          {dialogue.revisionRequested && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              Revision Requested
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // If we're viewing a project's episodes list
  if (!currentProject || typeof currentProject !== 'object') {
    console.log('Invalid project data:', currentProject);
    return (
      <div className="p-6">
        <div className="text-center p-8 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-gray-500 dark:text-gray-400">
            Invalid project data
          </p>
        </div>
      </div>
    );
  }

  // Filter and sort episodes
  const episodes = Array.isArray(currentProject.episodes) ? currentProject.episodes : [];
  const filteredEpisodes = useMemo(() => {
    return episodes
      .filter((episode) => {
        const matchesSearch = episode?.name?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || episode?.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const aValue = a[sortConfig.key as keyof Episode];
        const bValue = b[sortConfig.key as keyof Episode];

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'asc'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }
        return 0;
      });
  }, [episodes, searchTerm, statusFilter, sortConfig]);

  // Utility function to validate MongoDB ObjectId format
  function isValidObjectId(id: string): boolean {
    const objectIdPattern = /^[0-9a-fA-F]{24}$/;
    return objectIdPattern.test(id);
  }

  // Handle bulk actions
  const handleBulkAction = async (action: 'delete' | 'reprocess') => {
    if (selectedEpisodes.size === 0) return;

    setIsProcessing(true);
    try {
      // Implement bulk actions here
      console.log(`Bulk ${action} for episodes:`, Array.from(selectedEpisodes));
    } catch (error) {
      console.error(`Error performing bulk ${action}:`, error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Episodes for {currentProject.title}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Total Episodes: {filteredEpisodes.length}
            </p>
          </div>

          {/* Bulk Actions */}
          {selectedEpisodes.size > 0 && (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleBulkAction('reprocess')}
                disabled={isProcessing}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Reprocess Selected
              </button>
              <button
                onClick={() => handleBulkAction('delete')}
                disabled={isProcessing}
                className="inline-flex items-center px-3 py-2 border border-red-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:bg-gray-700 dark:text-red-400 dark:border-red-600 dark:hover:bg-gray-600"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Selected
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search episodes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>

        <div className="flex space-x-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="all">All Status</option>
            <option value="uploaded">Uploaded</option>
            <option value="processing">Processing</option>
            <option value="error">Error</option>
            <option value="completed">Completed</option>
          </select>

          <button
            onClick={() => setSortConfig({
              key: sortConfig.key,
              direction: sortConfig.direction === 'asc' ? 'desc' : 'asc'
            })}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
          >
            <ArrowUpDown className="w-4 h-4 mr-2" />
            Sort
          </button>
        </div>
      </div>

      {/* Episodes List */}
      <div className="space-y-4">
        {filteredEpisodes.length === 0 ? (
          <div className="text-center p-8 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-gray-500 dark:text-gray-400">
              {searchTerm ? 'No episodes match your search' : 'No episodes available for this project'}
            </p>
          </div>
        ) : (
          filteredEpisodes.map((episode) => {
            const projectIdStr = isValidObjectId(String(currentProject._id)) ? String(currentProject._id) : currentProject.title;
            const episodeIdStr = isValidObjectId(String(episode._id)) ? String(episode._id) : episode.name;
            const episodeNameStr = episode.name;
            const stats = calculateEpisodeStats(episode);

            return (
              <div
                key={episodeIdStr}
                className="flex items-center p-4 bg-white dark:bg-gray-800 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedEpisodes.has(episodeIdStr)}
                  onChange={(e) => {
                    const newSelected = new Set(selectedEpisodes);
                    if (e.target.checked) {
                      newSelected.add(episodeIdStr);
                    } else {
                      newSelected.delete(episodeIdStr);
                    }
                    setSelectedEpisodes(newSelected);
                  }}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mr-4"
                />

                <div className="flex-1 cursor-pointer" onClick={async () => {
                  if (loadingEpisodeId === episodeIdStr) {
                    console.debug('Click handler: Episode already loading', { episodeIdStr });
                    return;
                  }

                  if (!onEpisodeClick) {
                    console.debug('Click handler: No onEpisodeClick handler provided');
                    return;
                  }

                  // Validate required data before proceeding
                  if (!currentProject || !currentProject._id || !currentProject.title) {
                    console.warn('Click handler: Invalid project data', { currentProject });
                    return;
                  }

                  if (!episode || !episode.name || !episodeIdStr) {
                    console.warn('Click handler: Invalid episode data', { episode, episodeIdStr });
                    return;
                  }

                  console.debug('Click handler: Processing click', {
                    projectId: currentProject._id,
                    projectTitle: currentProject.title,
                    episodeName: episode.name,
                    episodeId: episodeIdStr
                  });

                  try {
                    setLoadingEpisodeId(episodeIdStr);
                    await onEpisodeClick(
                      String(currentProject._id),
                      episode.name,
                      episodeIdStr,
                      currentProject,
                      episode
                    );
                  } catch (error) {
                    console.error('Click handler: Error processing click:', error);
                  } finally {
                    setLoadingEpisodeId(null);
                  }
                }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${episode.status === 'uploaded'
                          ? 'bg-green-100 text-green-800 dark:bg-green-200 dark:text-green-900'
                          : episode.status === 'processing'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-200 dark:text-blue-900'
                            : episode.status === 'error'
                              ? 'bg-red-100 text-red-800 dark:bg-red-200 dark:text-red-900'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-200 dark:text-gray-900'
                        }`}>
                        {episode.status}
                      </span>
                      <span className="text-gray-900 dark:text-white font-medium">
                        {episodeNameStr}
                      </span>
                    </div>

                    <div className="flex items-center space-x-4">
                      {/* Progress Bar */}
                      <div className="hidden sm:flex items-center space-x-2">
                        <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${stats.percentComplete}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {stats.completedSteps} / {stats.totalSteps}
                        </span>
                      </div>

                      {/* Loading State */}
                      {loadingEpisodeId === episodeIdStr ? (
                        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
