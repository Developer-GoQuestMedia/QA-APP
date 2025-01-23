// lib/queue.ts
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Redis connection for BullMQ.
 * Example: redis://localhost:6379
 * or use process.env.REDIS_URL from your environment
 */
const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

export const audioCleanerQueue = new Queue('audio-cleaner-queue', { connection });
