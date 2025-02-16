// scripts/start-worker.ts
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Load environment variables in order of priority
config({ path: resolve(rootDir, '.env.production') });
config({ path: resolve(rootDir, '.env.local') });
config({ path: resolve(rootDir, '.env') });

// Verify environment variables are loaded
const requiredVars = ['MONGODB_URI', 'MONGODB_DB', 'UPSTASH_REDIS_REST_URL'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars);
  process.exit(1);
}

console.log('Environment loaded successfully:', {
  mongoDbUri: 'Set (hidden)',
  mongoDbName: process.env.MONGODB_DB,
  redisUrl: 'Set (hidden)',
  nodeEnv: process.env.NODE_ENV || 'production'
});

// Now import the worker after environment variables are loaded
import { audioCleanerWorker } from '../worker/audioCleanerWorker';

// Handle shutdown gracefully
const shutdown = async () => {
  console.log('Shutting down worker...');
  try {
    await audioCleanerWorker.close();
    console.log('Worker shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  shutdown();
});

console.log('Audio cleaner worker started successfully.'); 