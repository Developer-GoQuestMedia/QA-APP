import { MongoClient, Db, Collection, Document, MongoError } from 'mongodb';
import logger from './logger';
import { DatabaseError } from './errors';

let client: MongoClient | null = null;
let db: Db | null = null;

const MONGODB_URI = process.env.MONGODB_URI!;
const DB_NAME = process.env.DB_NAME || 'qa-app';

// Connection options with pooling
const options = {
  maxPoolSize: 10,
  minPoolSize: 5,
  maxIdleTimeMS: 60000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  retryReads: true,
  serverSelectionTimeoutMS: 5000,
  heartbeatFrequencyMS: 10000,
};

// Transient error codes that should be retried
const TRANSIENT_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'MONGODB_ERROR_NEED_RETRY',
]);

// Check if error is transient and should be retried
function isTransientError(error: any): boolean {
  if (error instanceof MongoError) {
    return TRANSIENT_ERROR_CODES.has(error.code || '') || error.message.includes('topology');
  }
  return false;
}

// Retry helper with exponential backoff
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (!isTransientError(error) || attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      logger.warn(`Database operation failed, retrying in ${delay}ms...`, {
        attempt: attempt + 1,
        maxRetries,
        error: lastError.message,
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  try {
    if (client && db) {
      // Verify connection is still alive
      await db.command({ ping: 1 });
      return { client, db };
    }

    if (!MONGODB_URI) {
      throw new DatabaseError('MongoDB URI is not configured');
    }

    client = new MongoClient(MONGODB_URI, options);
    await withRetry(() => client!.connect());
    db = client.db(DB_NAME);

    // Add indexes if they don't exist
    await createIndexes();

    logger.info('Connected to MongoDB', {
      database: DB_NAME,
      poolSize: options.maxPoolSize,
    });
    
    return { client, db };
  } catch (error) {
    const dbError = new DatabaseError(
      'Failed to connect to database',
      { originalError: error instanceof Error ? error.message : String(error) }
    );
    logger.error('Database connection error:', dbError);
    throw dbError;
  }
}

// Create necessary indexes
async function createIndexes() {
  if (!db) return;

  try {
    // Projects collection indexes
    await withRetry(() =>
      db!.collection('projects').createIndexes([
        { key: { title: 1 } },
        { key: { 'assignedTo.username': 1 } },
        { key: { status: 1 } },
        { key: { createdAt: 1 } }
      ])
    );

    // Episodes collection indexes
    await withRetry(() =>
      db!.collection('episodes').createIndexes([
        { key: { projectId: 1 } },
        { key: { status: 1 } },
        { key: { 'steps.status': 1 } }
      ])
    );

    // Dialogues collection indexes
    await withRetry(() =>
      db!.collection('dialogues').createIndexes([
        { key: { episodeId: 1 } },
        { key: { status: 1 } },
        { key: { characterName: 1 } }
      ])
    );

    logger.info('Database indexes created successfully');
  } catch (error) {
    const dbError = new DatabaseError(
      'Failed to create database indexes',
      { originalError: error instanceof Error ? error.message : String(error) }
    );
    logger.error('Error creating indexes:', dbError);
    throw dbError;
  }
}

// Query helper with automatic retry and timeout
export async function executeQuery<T extends Document>(
  collection: Collection<T>,
  operation: () => Promise<T | T[] | null>,
  retries = 3
): Promise<T | T[] | null> {
  try {
    return await withRetry(operation, retries);
  } catch (error) {
    const dbError = new DatabaseError(
      'Database query failed',
      {
        collection: collection.collectionName,
        originalError: error instanceof Error ? error.message : String(error)
      }
    );
    logger.error('Query execution error:', dbError);
    throw dbError;
  }
}

// Batch operation helper
export async function executeBatch<T extends Document>(
  collection: Collection<T>,
  operations: any[],
  batchSize = 100
): Promise<void> {
  const session = client?.startSession();
  try {
    await session?.withTransaction(async () => {
      for (let i = 0; i < operations.length; i += batchSize) {
        const batch = operations.slice(i, i + batchSize);
        await withRetry(() =>
          Promise.all(batch.map(op => collection.bulkWrite([op])))
        );
      }
    });
  } catch (error) {
    const dbError = new DatabaseError(
      'Batch operation failed',
      {
        collection: collection.collectionName,
        batchSize,
        operationsCount: operations.length,
        originalError: error instanceof Error ? error.message : String(error)
      }
    );
    logger.error('Batch operation error:', dbError);
    throw dbError;
  } finally {
    await session?.endSession();
  }
}

// Cleanup function
export async function disconnect(): Promise<void> {
  try {
    if (client) {
      await client.close();
      client = null;
      db = null;
      logger.info('Disconnected from MongoDB');
    }
  } catch (error) {
    const dbError = new DatabaseError(
      'Failed to disconnect from database',
      { originalError: error instanceof Error ? error.message : String(error) }
    );
    logger.error('Database disconnect error:', dbError);
    throw dbError;
  }
}

// Health check function
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    if (!client || !db) {
      await connectToDatabase();
    }
    await withRetry(() => db!.command({ ping: 1 }));
    return true;
  } catch (error) {
    logger.error('Database health check failed:', error);
    return false;
  }
}

// Connection monitoring
if (client) {
  client.on('serverHeartbeatFailed', (event) => {
    logger.warn('MongoDB server heartbeat failed', { event });
  });

  client.on('serverHeartbeatSucceeded', (event) => {
    logger.debug('MongoDB server heartbeat succeeded', { event });
  });

  client.on('topologyOpening', () => {
    logger.info('MongoDB topology opening');
  });

  client.on('topologyClosed', () => {
    logger.info('MongoDB topology closed');
  });
} 