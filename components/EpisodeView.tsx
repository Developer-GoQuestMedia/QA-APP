  'use client';

  import { Episode } from '@/types/project';
  import { useEffect, useState } from 'react';
  import { toast } from 'react-hot-toast';

  interface EpisodeViewProps {
    episode: Episode;
  }

  // Logging utility
  function logEpisodeEvent(event: string, data?: any) {
    const timestamp = new Date().toISOString();
    console.log(`EpisodeView.tsx:${event}`, {
      timestamp,
      ...data
    });
  }

  /**
   * Displays detailed info for a single episode.
   * Replace with your own styling & fields as needed.
   */
  export default function EpisodeView({ episode }: EpisodeViewProps) {
    const [isProcessing, setIsProcessing] = useState(false);

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
        uploadedAt: episode.uploadedAt,
        episodeData: {
          ...episode,
          videoPath: '[REDACTED]'
        }
      });
    }, [episode]);

    const handleStep1 = async () => {
      try {
        // Log episode data before ID check
        logEpisodeEvent('pre-step1-check', {
          episodeName: episode.name,
          episodeId: episode._id,
          hasId: !!episode._id,
          episodeData: {
            ...episode,
            videoPath: '[REDACTED]'
          }
        });

        if (!episode._id) {
          const errorMsg = 'Episode ID is missing. Please ensure the episode has been properly initialized.';
          logEpisodeEvent('step1-error-missing-id', {
            episodeName: episode.name,
            episodeData: {
              ...episode,
              videoPath: '[REDACTED]'
            }
          });
          toast.error(errorMsg);
          return;
        }

        console.log('Starting Step 1 with episode:', {
          id: episode._id,
          name: episode.name,
          hasId: !!episode._id,
          status: episode.status,
          step: episode.step
        });

        setIsProcessing(true);
        
        const response = await fetch(`/api/episodes/${episode._id}/clean-audio`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: episode.name,
            videoPath: episode.videoPath,
            videoKey: episode.videoKey,
            episodeId: episode._id,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Clean audio response error:', {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            episodeId: episode._id
          });
          throw new Error(errorText);
        }

        const result = await response.json();
        toast.success('Audio cleaning process started');
        logEpisodeEvent('audio-cleaning-started', {
          episodeId: episode._id,
          result
        });
      } catch (error) {
        console.error('Error cleaning audio:', error);
        toast.error('Failed to start audio cleaning process');
        logEpisodeEvent('audio-cleaning-error', {
          episodeId: episode._id,
          error,
          episodeData: {
            ...episode,
            videoPath: '[REDACTED]'
          }
        });
      } finally {
        setIsProcessing(false);
      }
    };
    

    const handleStep2 = async () => {
      try {
        setIsProcessing(true);
        const response = await fetch(`/api/episodes/${episode._id}/step2`, {
          method: 'POST',
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(error);
        }

        const result = await response.json();
        toast.success('Step 2 process started');
        logEpisodeEvent('step2-started', {
          episodeId: episode._id,
          result
        });
      } catch (error) {
        console.error('Error in step 2:', error);
        toast.error('Failed to start step 2 process');
        logEpisodeEvent('step2-error', {
          episodeId: episode._id,
          error
        });
      } finally {
        setIsProcessing(false);
      }
    };

    const handleStep3 = async () => {
      try {
        setIsProcessing(true);
        const response = await fetch(`/api/episodes/${episode._id}/step3`, {
          method: 'POST',
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(error);
        }

        const result = await response.json();
        toast.success('Step 3 process started');
        logEpisodeEvent('step3-started', {
          episodeId: episode._id,
          result
        });
      } catch (error) {
        console.error('Error in step 3:', error);
        toast.error('Failed to start step 3 process');
        logEpisodeEvent('step3-error', {
          episodeId: episode._id,
          error
        });
      } finally {
        setIsProcessing(false);
      }
    };

    // Log render
    logEpisodeEvent('render', {
      episodeName: episode.name,
      episodeId: episode._id,
      status: episode.status
    });

    const getStepButton = () => {
      if (isProcessing) {
        return (
          <button
            disabled
            className="px-4 py-2 rounded-md text-white font-medium bg-gray-400 cursor-not-allowed"
          >
            Processing...
          </button>
        );
      }

      if (!episode.step || episode.step === 1) {
        return (
          <button
            onClick={handleStep1}
            disabled={episode.status !== 'uploaded'}
            className={`px-4 py-2 rounded-md text-white font-medium ${
              episode.status !== 'uploaded'
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            Step 1: Clean Audio
          </button>
        );
      }

      if (episode.step === 2) {
        return (
          <button
            onClick={handleStep2}
            className="px-4 py-2 rounded-md text-white font-medium bg-blue-600 hover:bg-blue-700"
          >
            Step 2: Process
          </button>
        );
      }

      if (episode.step === 3) {
        return (
          <button
            onClick={handleStep3}
            className="px-4 py-2 rounded-md text-white font-medium bg-blue-600 hover:bg-blue-700"
          >
            Step 3: Finalize
          </button>
        );
      }

      return null;
    };

    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-4">{episode.name}</h1>
        <div className="grid gap-4">
          <div>
            <label className="text-sm font-medium text-gray-500">Collection Name</label>
            <p>{episode.collectionName}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Video Path</label>
            <p>{episode.videoPath}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Status</label>
            <p className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              episode.status === 'uploaded' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' :
              episode.status === 'processing' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' :
              'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300'
            }`}>
              {episode.status}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Current Step</label>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {episode.step || 1} of 3
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Uploaded At</label>
            <p>{new Date(episode.uploadedAt).toLocaleString()}</p>
          </div>
          <div className="mt-4">
            {getStepButton()}
          </div>
        </div>
      </div>
    );
  }
