// worker/audioCleanerWorker.ts
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import axios from 'axios';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

// Create a BullMQ Worker for the same queue name
const audioCleanerWorker = new Worker(
  'audio-cleaner-queue',
  async (job: Job) => {
    // job.data contains { episodeId, name, videoPath, videoKey }
    const { episodeId, name, videoPath, videoKey } = job.data;
    console.log(`Worker received job for episode: ${episodeId}`);

    try {
      // 1) Connect to your DB
      const { db } = await connectToDatabase();

      // 2) Mark the episode as "in-progress" or "cleaning"
      await db.collection('projects').updateOne(
        { 'episodes._id': new ObjectId(episodeId) },
        { $set: { 'episodes.$.status': 'cleaning', 'episodes.$.step': 1 } }
      );

      // 3) Call your external audio-cleaner
      console.log('Worker calling external audio cleaner...');
      const cleanerResponse = await axios.post(
        'https://audio-cleaner-676840814994.us-central1.run.app/audio-cleaner',
        { name, videoPath, videoKey },
        { headers: { 'Content-Type': 'application/json' } }
      );

      // 4) On success, update your episode DB with the new paths
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
          },
        }
      );

      console.log('Worker: Episode successfully updated with cleaned audio.');
    } catch (err: any) {
      console.error('Worker error processing job:', err.message);
      // Mark episode as error
      const { db } = await connectToDatabase();
      await db.collection('projects').updateOne(
        { 'episodes._id': new ObjectId(job.data.episodeId) },
        { $set: { 'episodes.$.status': 'error', 'episodes.$.errorDetail': err.message } }
      );
      throw err; // Let BullMQ register that the job failed
    }
  },
  { connection }
);

audioCleanerWorker.on('completed', (job) => {
  console.log(`Worker job ${job.id} completed successfully`);
});

audioCleanerWorker.on('failed', (job, err) => {
  console.error(`Worker job ${job?.id} failed:`, err);
});
