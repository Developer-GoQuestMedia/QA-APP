// lib/queueJobs.ts
import { Job } from 'bullmq';
import { audioCleanerQueue } from './queue';
import { isRedisConnected } from './redis';

export interface AudioCleanerJobData {
  episodeId: string;
  name: string;
  videoPath: string;
  videoKey: string;
}

export interface JobProgress {
  progress: number;
  phase: 'uploading' | 'cleaning' | 'processing' | 'complete';
  message?: string;
}

export interface JobStatus {
  status: 'active' | 'waiting' | 'completed' | 'failed' | 'not_found' | 'unavailable' | 'error';
  message?: string;
  id?: string;
  progress?: any;
  logs?: string[];
  data?: AudioCleanerJobData;
  attemptsMade?: number;
  timestamp?: number;
}

export interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  total: number;
  timestamp: string;
  status: 'available' | 'unavailable' | 'error';
  error?: string;
}

/**
 * Add a new audio cleaning job to the queue
 */
export async function addAudioCleaningJob(data: AudioCleanerJobData) {
  if (!audioCleanerQueue) {
    console.warn('Queue not available, skipping job addition');
    return null;
  }

  try {
    const job = await audioCleanerQueue.add('clean-audio', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 100, // Keep last 100 completed jobs
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      },
    });

    console.log(`Added audio cleaning job ${job.id} for episode ${data.episodeId}`);
    return job;
  } catch (error) {
    console.error('Failed to add audio cleaning job:', error);
    return null;
  }
}

/**
 * Get the status of a specific job
 */
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  if (!audioCleanerQueue) {
    return { status: 'unavailable', message: 'Queue not available' };
  }

  try {
    const job = await audioCleanerQueue.getJob(jobId);
    if (!job) {
      return { status: 'not_found' };
    }

    const state = await job.getState();
    const progress = await job.progress;
    const logs = await job.logs();

    return {
      id: job.id,
      status: state as JobStatus['status'],
      progress,
      logs,
      data: job.data,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
    };
  } catch (error) {
    console.error(`Failed to get status for job ${jobId}:`, error);
    return { 
      status: 'error', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Get all active jobs in the queue
 */
export async function getActiveJobs() {
  if (!audioCleanerQueue) {
    return [];
  }

  try {
    const jobs = await audioCleanerQueue.getActive();
    return jobs.map(job => ({
      id: job.id,
      data: job.data,
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
    }));
  } catch (error) {
    console.error('Failed to get active jobs:', error);
    return [];
  }
}

/**
 * Get queue metrics
 */
export async function getQueueMetrics(): Promise<QueueMetrics> {
  if (!audioCleanerQueue) {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      total: 0,
      timestamp: new Date().toISOString(),
      status: 'unavailable'
    };
  }

  try {
    const [waiting, active, completed, failed] = await Promise.all([
      audioCleanerQueue.getWaitingCount(),
      audioCleanerQueue.getActiveCount(),
      audioCleanerQueue.getCompletedCount(),
      audioCleanerQueue.getFailedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed,
      timestamp: new Date().toISOString(),
      status: 'available'
    };
  } catch (error) {
    console.error('Failed to get queue metrics:', error);
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      total: 0,
      timestamp: new Date().toISOString(),
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Clean up old jobs
 */
export async function cleanupOldJobs() {
  if (!audioCleanerQueue) {
    console.warn('Queue not available, skipping cleanup');
    return;
  }

  try {
    const jobs = await audioCleanerQueue.clean(24 * 3600 * 1000, 100, 'completed');
    console.log(`Cleaned up ${jobs.length} completed jobs`);

    const failedJobs = await audioCleanerQueue.clean(7 * 24 * 3600 * 1000, 100, 'failed');
    console.log(`Cleaned up ${failedJobs.length} failed jobs`);
  } catch (error) {
    console.error('Failed to clean up old jobs:', error);
    // Don't throw error, just log it
  }
} 