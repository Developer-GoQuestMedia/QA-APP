'use client';

import { Episode } from '@/types/project';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Tab } from '@headlessui/react';
import clsx from 'clsx';
import axios, { AxiosError } from 'axios';


interface EpisodeViewProps {
  episode: Episode;
}

interface LogEventData {
  timestamp?: string;
  episodeName?: string;
  episodeId?: string;
  collectionName?: string;
  hasId?: boolean;
  status?: string;
  uploadedAt?: string;
  result?: unknown;
  error?: unknown;
  episodeData?: Omit<Episode, 'videoPath'> & { videoPath: string };
}

type StepKey = 'step1' | 'step2' | 'step3' | 'step4' | 'step5' | 'step6' | 'step7' | 'step8';

// Logging utility
function logEpisodeEvent(event: string, data?: LogEventData) {
  const timestamp = new Date().toISOString();
  console.log(`AdminEpisodeView.tsx:${event}`, {
    timestamp,
    ...data
  });
}

const STEPS = [
  { id: 1, title: 'Clean Audio', description: 'Clean and separate speech from background audio' },
  { id: 2, title: 'Scene Data', description: 'Extract scene information from video' },
  { id: 3, title: 'Video Clips', description: 'Cut video into individual clips' },
  { id: 4, title: 'Translation', description: 'Get episode translation data' },
  { id: 5, title: 'Voice Assignment', description: 'Assign voice IDs to characters' },
  { id: 6, title: 'Voice Conversion', description: 'Convert dialogues using 11labs API' },
  { id: 7, title: 'Audio Merge', description: 'Merge AI voices with SFX audio' },
  { id: 8, title: 'Final Video', description: 'Merge new audio with video' }
] as const;

/**
 * Displays detailed info for a single episode in the admin context.
 * Replace with your own styling & fields as needed.
 */
export default function AdminEpisodeView({ episode }: EpisodeViewProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedStep, setSelectedStep] = useState(episode.step || 1);

  // Log component mount
  useEffect(() => {
    logEpisodeEvent('mount', { 
      episodeName: episode.name,
      episodeId: episode._id,
      collectionName: episode.collectionName,
      hasId: !!episode._id,
      episodeData: {
        ...episode,
        videoPath: '[REDACTED]'
      }
    });

    return () => {
      logEpisodeEvent('unmount', { 
        episodeName: episode.name,
        episodeId: episode._id,
        hasId: !!episode._id
      });
    };
  }, [episode]);

  // Log prop changes
  useEffect(() => {
    logEpisodeEvent('episode-updated', {
      episodeName: episode.name,
      episodeId: episode._id,
      hasId: !!episode._id,
      status: episode.status,
      collectionName: episode.collectionName,
      uploadedAt: episode.uploadedAt?.toISOString(),
      episodeData: {
        ...episode,
        videoPath: '[REDACTED]'
      }
    });
  }, [episode]);

  const handleStepProcess = async (stepNumber: number) => {
    if (isProcessing) return;

    try {
      setIsProcessing(true);
      logEpisodeEvent(`step${stepNumber}-start`, {
        episodeId: episode._id,
        episodeName: episode.name
      });


      let response;
      try {
        response = await axios.post(`/api/episodes/${episode._id}/step${stepNumber}`, {
          name: episode.name,
          videoPath: episode.videoPath,
          videoKey: episode.videoKey,
          episodeId: episode._id,
          step: stepNumber
        }, {
          headers: {
            'Content-Type': 'application/json'
          }
        });
      } catch (err) {
        const error = err as AxiosError;
        if (axios.isAxiosError(error)) {
          logEpisodeEvent('api-error', {
            episodeId: episode._id,
            error: {
              message: error.message,
              status: error.response?.status,
              data: error.response?.data,
              code: error.code
            }
          });
          throw new Error(
            `API Error: ${(error.response?.data as {message?: string})?.message || error.message}`
          );
        }
        
        const unknownError = err as Error;
        logEpisodeEvent('unknown-error', {
          episodeId: episode._id,
          error: {
            message: unknownError.message,
            name: unknownError.name,
            stack: unknownError.stack
          }
        });
        throw new Error(`Unexpected error: ${unknownError.message}`);
      }

      if (!response?.data) {
        throw new Error('No data received from server');
      }

      if (response.status >= 400) {
        const errorMessage = response.data?.error || response.statusText || 'Unknown error occurred';
        throw new Error(errorMessage);
      }

      const data = response.data;
      toast.success(`Step ${stepNumber} process started`);
      logEpisodeEvent(`step${stepNumber}-started`, {
        episodeId: episode._id,
        result: data
      });
    } catch (error) {
      console.error(`Error in step ${stepNumber}:`, error);
      toast.error(`Failed to start step ${stepNumber} process`);
      logEpisodeEvent(`step${stepNumber}-error`, {
        episodeId: episode._id,
        error
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getStepStatus = (stepNumber: number) => {
    const stepKey = `step${stepNumber}` as StepKey;
    const stepData = episode.steps?.[stepKey];
    return stepData?.status || 'pending';
  };

  const isStepEnabled = (stepNumber: number) => {
    if (stepNumber === 1) return episode.status === 'uploaded';
    const previousStepStatus = getStepStatus(stepNumber - 1);
    return previousStepStatus === 'completed';
  };

  const renderStepContent = (stepNumber: number) => {
    const stepKey = `step${stepNumber}` as StepKey;
    const stepData = episode.steps?.[stepKey];
    const status = getStepStatus(stepNumber);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium">{STEPS[stepNumber - 1].title}</h3>
            <p className="text-sm text-gray-500">{STEPS[stepNumber - 1].description}</p>
          </div>
          <div className="flex items-center space-x-4">
            <span className={clsx(
              'px-2.5 py-0.5 rounded-full text-xs font-medium',
              status === 'completed' && 'bg-green-100 text-green-800',
              status === 'processing' && 'bg-blue-100 text-blue-800',
              status === 'error' && 'bg-red-100 text-red-800',
              status === 'pending' && 'bg-gray-100 text-gray-800'
            )}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
            <button
              onClick={() => handleStepProcess(stepNumber)}
              disabled={isProcessing || !isStepEnabled(stepNumber)}
              className={clsx(
                'px-4 py-2 rounded-md text-white font-medium',
                (isProcessing || !isStepEnabled(stepNumber))
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              )}
            >
              {isProcessing ? 'Processing...' : `Start ${STEPS[stepNumber - 1].title}`}
            </button>
          </div>
        </div>
        {stepData && (
          <div className="mt-4 bg-gray-50 rounded-lg p-4">
            <pre className="text-sm overflow-auto">
              {JSON.stringify(stepData, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  };

  // Log render
  logEpisodeEvent('render', {
    episodeName: episode.name,
    episodeId: episode._id,
    status: episode.status
  });

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">{episode.name}</h1>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-500">Collection Name</label>
            <p>{episode.collectionName}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Status</label>
            <p className={clsx(
              'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
              episode.status === 'uploaded' && 'bg-green-100 text-green-800',
              episode.status === 'processing' && 'bg-blue-100 text-blue-800',
              episode.status === 'error' && 'bg-red-100 text-red-800'
            )}>
              {episode.status}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Uploaded At</label>
            <p>{episode.uploadedAt ? new Date(episode.uploadedAt).toLocaleString() : 'Not available'}</p>
          </div>
        </div>
      </div>

      <Tab.Group selectedIndex={selectedStep - 1} onChange={(index: number) => setSelectedStep(index + 1)}>
        <Tab.List className="flex space-x-1 rounded-xl bg-blue-900/20 p-1">
          {STEPS.map((step) => (
            <Tab
              key={step.id}
              className={({ selected }: { selected: boolean }) =>
                clsx(
                  'w-full rounded-lg py-2.5 text-sm font-medium leading-5',
                  'ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2',
                  selected
                    ? 'bg-white text-blue-700 shadow'
                    : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'
                )
              }
            >
              Step {step.id}
            </Tab>
          ))}
        </Tab.List>
        <Tab.Panels className="mt-4">
          {STEPS.map((step) => (
            <Tab.Panel
              key={step.id}
              className={clsx(
                'rounded-xl bg-white p-3',
                'ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2'
              )}
            >
              {renderStepContent(step.id)}
            </Tab.Panel>
          ))}
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}
