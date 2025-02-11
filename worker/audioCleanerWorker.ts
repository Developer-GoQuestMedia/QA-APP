// worker/audioCleanerWorker.ts
import { Worker, Job } from 'bullmq';
import { getRedisConnection } from '@/lib/queue';
import axios from 'axios';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

interface AudioCleanerJob {
  episodeId: string;
  name: string;
  videoPath: string;
  videoKey: string;
}

// Create a BullMQ Worker for the audio cleaner queue
const createAudioCleanerWorker = () => {
  try {
    const connection = getRedisConnection();
    
    const worker = new Worker<AudioCleanerJob>(
      'audio-cleaner-queue',
      async (job: Job<AudioCleanerJob>) => {
        const { episodeId, name, videoPath, videoKey } = job.data;
        console.log(`Worker received job for episode: ${episodeId}`);

        try {
          // 1) Connect to DB
          const { db } = await connectToDatabase();

          // 2) Mark episode as "cleaning"
          await db.collection('projects').updateOne(
            { 'episodes._id': new ObjectId(episodeId) },
            { $set: { 'episodes.$.status': 'cleaning', 'episodes.$.step': 1 } }
          );

          // 3) Call external audio-cleaner
          console.log('Worker calling external audio cleaner...');
          const cleanerResponse = await axios.post(
            'https://audio-cleaner-676840814994.us-central1.run.app/audio-cleaner',
            { name, videoPath, videoKey, episodeId },
            { 
              headers: { 'Content-Type': 'application/json' },
              timeout: 30000 // 30 second timeout
            }
          );

          // 4) Update episode with cleaned audio paths
          const data = cleanerResponse.data;
          await db.collection('projects').updateOne(
            { 'episodes._id': new ObjectId(episodeId) },
            {
              $set: {
                'episodes.$.cleanedSpeechPath': data.cleanedSpeechPath,
                'episodes.$.cleanedSpeechKey': data.cleanedSpeechKey,
                'episodes.$.musicAndSoundEffectsPath': data.musicAndSoundEffectsPath,
                'episodes.$.musicAndSoundEffectsKey': data.musicAndSoundEffectsKey,
                'episodes.$.status': 'processing',
                'episodes.$.step': 2,
                'episodes.$.lastProcessed': new Date(),
              },
            }
          );

          console.log('Worker: Episode successfully updated with cleaned audio.');
          return { success: true, episodeId };
        } catch (err: any) {
          console.error('Worker error processing job:', err.message);
          
          // Mark episode as error
          const { db } = await connectToDatabase();
          await db.collection('projects').updateOne(
            { 'episodes._id': new ObjectId(episodeId) },
            { 
              $set: { 
                'episodes.$.status': 'error',
                'episodes.$.errorDetail': err.message,
                'episodes.$.lastError': new Date()
              } 
            }
          );
          
          throw err; // Let BullMQ register the job failure
        }
      },
      { 
        connection,
        concurrency: 1, // Process one job at a time
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 100 // Keep last 100 completed jobs
        },
        removeOnFail: {
          age: 7 * 24 * 3600 // Keep failed jobs for 7 days
        }
      }
    );

    // Event handlers
    worker.on('completed', (job) => {
      console.log(`Worker job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, err) => {
      console.error(`Worker job ${job?.id} failed:`, err);
    });

    worker.on('error', (err) => {
      console.error('Worker error:', err);
    });

    return worker;
  } catch (error) {
    console.error('Failed to create audio cleaner worker:', error);
    throw error;
  }
};

// Create and export the worker instance
export const audioCleanerWorker = createAudioCleanerWorker();
