// scripts/start-worker.ts
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Load environment variables from .env.worker
const result = config({ path: resolve(rootDir, '.env.worker') });

if (result.error) {
  console.error('Error loading environment variables:', result.error);
  process.exit(1);
}

// Verify environment variables are loaded
const requiredVars = ['MONGODB_URI', 'MONGODB_DB', 'REDIS_URL'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars);
  process.exit(1);
}

console.log('Environment loaded successfully:', {
  mongoDbUri: 'Set (hidden)',
  mongoDbName: process.env.MONGODB_DB,
  redisUrl: process.env.REDIS_URL,
  nodeEnv: process.env.NODE_ENV
});

// Now import the worker after environment variables are loaded
import { audioCleanerWorker } from '../worker/audioCleanerWorker';

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM signal, closing worker...');
  await audioCleanerWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT signal, closing worker...');
  await audioCleanerWorker.close();
  process.exit(0);
});

console.log('Audio cleaner worker started successfully.'); 