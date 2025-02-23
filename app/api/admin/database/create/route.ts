import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Worker } from 'worker_threads';
import path from 'path';
import { createCollections } from '@/workers/createCollections';

// Improved type definitions
interface VideoFile {
  name: string;
  size: number;
  type: string;
}

interface ProjectCreationResponse {
  success: boolean;
  data?: {
    databaseName: string;
    collections: string[];
    index: string;
  };
  error?: string;
}

// Connection pool for MongoDB
const clientPromise = MongoClient.connect(process.env.MONGODB_URI!, {
  maxPoolSize: 10,
  minPoolSize: 5
});

export async function POST(req: Request) {
  let client: MongoClient | null = null;

  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Parse JSON body
    const body = await req.json();
    const { projectTitle, videoFiles } = body as { 
      projectTitle: string; 
      videoFiles: VideoFile[] 
    };

    // Validation
    if (!projectTitle || !videoFiles?.length) {
      return NextResponse.json(
        { success: false, error: 'Invalid input data' },
        { status: 400 }
      );
    }

    // Get connection from pool
    client = await clientPromise;
    const projectsDb = client.db(process.env.MONGODB_DB || 'dubbing_portal');
    const projectsCollection = projectsDb.collection('projects');

    // Sanitize database name
    const dbName = projectTitle.toLowerCase().replace(/[^a-z0-9]/g, '_');

    // Check existing project using index
    const existingProject = await projectsCollection
      .findOne({ databaseName: dbName }, { projection: { _id: 1 } });

    if (existingProject) {
      return NextResponse.json(
        { success: false, error: 'Project already exists' },
        { status: 400 }
      );
    }

    // Create collections
    const collections = videoFiles.map(file => ({
      name: file.name.toLowerCase().replace(/\.mp4$/, '').replace(/[^a-z0-9]/g, '_')
    }));

    const db = client.db(dbName);
    
    // Create collections in parallel
    await Promise.all(collections.map(async (collection) => {
      try {
        await db.createCollection(collection.name, {
          validator: {
            $jsonSchema: {
              bsonType: 'object',
              required: ['status', 'createdAt'],
              properties: {
                status: { bsonType: 'string' },
                createdAt: { bsonType: 'date' },
                updatedAt: { bsonType: 'date' }
              }
            }
          }
        });
      } catch (error) {
        // If collection already exists, continue
        if ((error as any).code !== 48) {
          throw error;
        }
      }
    }));

    // Get next available index efficiently
    const nextIndex = await projectsCollection
      .find({}, { projection: { index: 1 } })
      .sort({ index: -1 })
      .limit(1)
      .toArray()
      .then(docs => docs.length ? parseInt(docs[0].index) + 1 : 1);

    // Create project record with null check
    await projectsCollection.insertOne({
      title: projectTitle,
      databaseName: dbName,
      collections: collections.map(c => c.name),
      index: nextIndex.toString(),
      createdAt: new Date(),
      createdBy: session?.user?.username || 'system'
    });

    const response: ProjectCreationResponse = {
      success: true,
      data: {
        databaseName: dbName,
        collections: collections.map(c => c.name),
        index: nextIndex.toString()
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Database creation error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  } finally {
    if (client) {
      // Return connection to pool instead of closing
      // client.close() is not needed when using connection pooling
    }
  }
} 