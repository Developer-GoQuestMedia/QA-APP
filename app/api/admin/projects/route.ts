import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectsCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId, Filter, WithId } from 'mongodb';
import { getSocketInstance } from '@/lib/socket';
import { Server } from 'socket.io';
import type { Document, UpdateFilter } from 'mongodb';

// Route Segment Config
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Maximum allowed for hobby plan
export const runtime = 'nodejs';

// Initialize S3 client for R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_BUCKET_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || '';

// Helper function to delete a folder and all objects inside it
async function deleteR2Folder(folderPath: string) {
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: folderPath,
    });
    const listedObjects = await s3Client.send(listCommand);

    if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
      return;
    }

    // Delete all objects in the folder
    await Promise.all(
      listedObjects.Contents.map(async (object) => {
        if (object.Key) {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: object.Key,
          });
          await s3Client.send(deleteCommand);
        }
      })
    );
  } catch (error) {
    console.error('Error deleting R2 folder:', error);
    throw error;
  }
}

// =========== Interfaces ===========

interface Episode {
  _id: ObjectId;
  name: string;
  status: 'uploaded' | 'processing' | 'error';
  videoPath: string;
  videoKey: string;
  collectionName: string;
  uploadedAt: Date;
}

interface Project {
  _id: ObjectId;
  title: string;
  description: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  assignedTo: any[];
  parentFolder: string;
  databaseName: string;
  episodes: Episode[];
  index: number;
  uploadStatus: {
    totalFiles: number;
    completedFiles: number;
    currentFile: number;
    status: string;
  };
}

// =========== Helpers ===========

// Node.js memory usage logging
function logMemoryUsage() {
  const used = process.memoryUsage();
  console.log('Memory usage:', {
    rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(used.external / 1024 / 1024)}MB`,
  });
}

// File size constants
const MAX_FILE_SIZE = 800 * 1024 * 1024; // 800MB
const MAX_TOTAL_SIZE = 10 * 1024 * 1024 * 1024; // 10GB

// Check if a file exists in R2
async function checkFileExistsInR2(key: string): Promise<boolean> {
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
    await s3Client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      return false;
    }
    throw error;
  }
}

// Ensure a particular collection is created in a database
async function ensureDatabaseAndCollection(client: any, databaseName: string, collectionName: string) {
  try {
    const db = client.db(databaseName);

    // Check if collection exists
    const collections = await db.listCollections({ name: collectionName }).toArray();
    if (collections.length === 0) {
      console.log(`[${new Date().toISOString()}] Creating collection ${collectionName} in database ${databaseName}`);
      const newCollection = await db.createCollection(collectionName);
      // Insert a placeholder doc to confirm creation
      await newCollection.insertOne({
        createdAt: new Date(),
        info: `Placeholder doc for collection: ${collectionName}`,
      });
    }
    return true;
  } catch (error) {
    console.error('Error ensuring database and collection:', error);
    throw error;
  }
}

// Ensure an episode record is present for a project
async function ensureEpisodeInDatabase(client: any, projectId: string, episode: Episode) {
  const { db } = await connectToDatabase();

  const filter: Filter<Project> = { _id: new ObjectId(projectId) };

  // Update project with a new or existing episode
  const result = await db
    .collection<Project>('projects')
    .findOneAndUpdate(
      filter,
      {
        $addToSet: {
          episodes: {
            ...episode,
            status: 'uploaded',
            uploadedAt: new Date(),
          },
        },
      },
      { returnDocument: 'after' }
    );

  if (!result) {
    throw new Error('Failed to update project with episode');
  }

  const projectDoc = result;
  // Ensure the project's database/collection exist
  const projectDb = client.db(projectDoc.databaseName);
  const collections = await projectDb.listCollections({ name: episode.collectionName }).toArray();
  if (collections.length === 0) {
    const collection = await projectDb.createCollection(episode.collectionName);
    await collection.insertOne({
      episodeId: episode._id,
      name: episode.name,
      videoPath: episode.videoPath,
      videoKey: episode.videoKey,
      status: 'uploaded',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        projectId: projectDoc._id,
        collectionName: episode.collectionName,
      },
    });
  }

  return result;
}

// Streaming utility for large file uploads
async function* streamFile(file: Blob, chunkSize = 5 * 1024 * 1024) {
  const buffer = await file.arrayBuffer();
  let offset = 0;
  
  while (offset < buffer.byteLength) {
    const end = Math.min(offset + chunkSize, buffer.byteLength);
    yield Buffer.from(buffer.slice(offset, end));
    offset = end;
  }
}

// =========== POST: Upload Route ===========

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let io: Server | { emit: (event: string, data: any) => void } | null = null;
  try {
    io = getSocketInstance();
  } catch (error) {
    console.warn('Socket.IO not initialized, continuing without real-time updates');
  }

  logMemoryUsage(); // Initial memory usage

  try {
    // 1. Authorization
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Connect to database
    const { db, client } = await connectToDatabase();

    // 3. Get the next available index number
    const lastProject = await db.collection<Project>('projects')
      .find({}, { projection: { index: 1 } })
      .sort({ index: -1 })
      .limit(1)
      .toArray();

    const nextIndex = (lastProject[0]?.index || 0) + 1;

    // 4. Parse FormData and validate files
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const sourceLanguage = formData.get('sourceLanguage') as string;
    const targetLanguage = formData.get('targetLanguage') as string;
    const videos = formData.getAll('videos');

    // 5. Validate required fields
    if (!title || !sourceLanguage || !targetLanguage || !videos.length) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check for duplicate project title
    const existingProject = await db.collection<Project>('projects').findOne({ title });
    if (existingProject) {
      return NextResponse.json(
        { error: 'Project with this title already exists' },
        { status: 400 }
      );
    }

    // 6. Start MongoDB session for transaction
    const mongoSession = await client.startSession();
    mongoSession.startTransaction();

    try {
      // Create project document
      const projectId = new ObjectId();
      const newProject: Omit<Project, '_id'> & { _id: ObjectId } = {
        _id: projectId,
        title,
        description,
        sourceLanguage,
        targetLanguage,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
        assignedTo: [],
        parentFolder: `project_${projectId}`,
        databaseName: `project_${projectId}_db`,
        episodes: [],
        index: nextIndex,
        uploadStatus: {
          totalFiles: videos.length,
          completedFiles: 0,
          currentFile: 0,
          status: 'pending'
        }
      };

      // Insert project
      await db.collection<Project>('projects').insertOne(newProject);

      // Process video files
      const uploadedFiles: Episode[] = [];
      for (const videoFile of videos) {
        if (!(videoFile instanceof Blob)) {
          continue;
        }

        // Check file size
        if (videoFile.size > MAX_FILE_SIZE) {
          await mongoSession.abortTransaction();
          return NextResponse.json(
            { error: 'File size exceeds maximum limit of 1GB' },
            { status: 400 }
          );
        }

        const episodeNumber: number = uploadedFiles.length + 1;
        const fileName: string = `P${nextIndex}_E${episodeNumber}_${(videoFile as any).name || `episode_${Date.now()}.mp4`}`;
        const fileKey = `projects/${projectId}/${fileName}`;
        const contentType = videoFile.type || 'video/mp4';

        // Check if file exists
        const fileExists = await checkFileExistsInR2(fileKey);
        if (fileExists) {
          uploadedFiles.push({
            _id: new ObjectId(),
            name: fileName,
            collectionName: `project_${projectId}_dialogues`,
            videoPath: await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey }), { expiresIn: 3600 }),
            videoKey: fileKey,
            status: 'uploaded',
            uploadedAt: new Date()
          });
          continue;
        }

        try {
          // Create multipart upload
          const multipartUpload = await s3Client.send(
            new CreateMultipartUploadCommand({
              Bucket: BUCKET_NAME,
              Key: fileKey,
              ContentType: contentType,
            })
          );
          const uploadId = multipartUpload.UploadId!;
          const parts: { ETag: string; PartNumber: number }[] = [];
          let partNumber = 1;

          // Upload chunks
          const chunkSize = 5 * 1024 * 1024;
          const totalChunks = Math.ceil(videoFile.size / chunkSize);
          let uploadedBytes = 0;

          for await (const chunk of streamFile(videoFile, chunkSize)) {
            const uploadPartResponse = await s3Client.send(
              new UploadPartCommand({
                Bucket: BUCKET_NAME,
                Key: fileKey,
                UploadId: uploadId,
                PartNumber: partNumber,
                Body: chunk,
              })
            );

            if (!uploadPartResponse.ETag) {
              throw new Error('Failed to get ETag for uploaded part');
            }

            parts.push({
              ETag: uploadPartResponse.ETag,
              PartNumber: partNumber,
            });

            uploadedBytes += chunk.length;
            const progressPercent = Math.round((uploadedBytes / videoFile.size) * 100);

            // Emit progress
            if (io) {
              io.emit('uploadProgress', {
                projectId: projectId.toString(),
                fileName,
                collectionName: `project_${projectId}_dialogues`,
                partNumber,
                totalChunks,
                progressPercent,
                uploadedBytes,
                totalBytes: videoFile.size,
              });
            }

            partNumber++;
          }

          // Complete upload
          await s3Client.send(
            new CompleteMultipartUploadCommand({
              Bucket: BUCKET_NAME,
              Key: fileKey,
              UploadId: uploadId,
              MultipartUpload: { Parts: parts },
            })
          );

          // Get signed URL
          const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey }), {
            expiresIn: 3600,
          });

          uploadedFiles.push({
            _id: new ObjectId(),
            name: fileName,
            collectionName: `project_${projectId}_dialogues`,
            videoPath: signedUrl,
            videoKey: fileKey,
            status: 'uploaded',
            uploadedAt: new Date()
          });
        } catch (error) {
          console.error(`Error uploading file ${fileName}:`, error);
          // Update project status to reflect error
          await db.collection<Project>('projects').updateOne(
            { _id: projectId },
            {
              $set: {
                updatedAt: new Date(),
                'uploadStatus.status': 'error',
                status: 'error',
              },
            },
            { session: mongoSession }
          );
          throw error;
        }
      }

      // Update project with episodes
      const updateOperation: UpdateFilter<Project> = {
        $push: {
          episodes: {
            $each: uploadedFiles
          }
        } as any,
        $set: {
          uploadStatus: {
            totalFiles: videos.length,
            completedFiles: uploadedFiles.length,
            currentFile: uploadedFiles.length,
            status: 'completed'
          }
        }
      };

      await db.collection<Project>('projects').updateOne(
        { _id: projectId },
        updateOperation,
        { session: mongoSession }
      );

      await mongoSession.commitTransaction();

      return NextResponse.json({
        success: true,
        data: {
          ...newProject,
          episodes: uploadedFiles
        }
      });
    } catch (error) {
      await mongoSession.abortTransaction();
      throw error;
    } finally {
      await mongoSession.endSession();
    }
  } catch (error: any) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project', details: error.message },
      { status: 500 }
    );
  } finally {
    // Attempt GC if available
    if (global.gc) {
      try {
        global.gc();
      } catch {}
    }
    logMemoryUsage(); // Final memory usage
  }
}

// =========== DELETE: Project Deletion ===========

export async function DELETE(request: NextRequest) {
  const startTime = new Date().toISOString();
  const logContext = {
    timestamp: startTime,
    endpoint: 'DELETE /api/admin/projects',
  };

  try {
    console.log('Starting project deletion process...', {
      ...logContext,
      step: 'initialization',
    });

    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== 'admin') {
      console.log('Unauthorized deletion attempt:', {
        ...logContext,
        step: 'authorization',
        user: session?.user,
        status: 'rejected',
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    Object.assign(logContext, {
      userId: session.user.id,
      userRole: session.user.role,
    });

    // Get project ID from URL
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('id');
    if (!projectId) {
      console.log('Missing project ID in delete request', {
        ...logContext,
        step: 'validation',
        status: 'rejected',
      });
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    Object.assign(logContext, { projectId });

    console.log('Connecting to database...', {
      ...logContext,
      step: 'database_connection',
    });
    const { db, client } = await connectToDatabase();

    // Fetch project details
    console.log('Fetching project details...', {
      ...logContext,
      step: 'project_lookup',
    });
    const project = await db.collection<Project>('projects').findOne({ _id: new ObjectId(projectId) });

    if (!project) {
      console.log('Project not found', {
        ...logContext,
        step: 'project_lookup',
        status: 'not_found',
      });
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    Object.assign(logContext, {
      projectTitle: project.title,
      databaseName: project.databaseName,
    });

    console.log('Project found', {
      ...logContext,
      step: 'project_lookup',
      status: 'success',
      project: {
        title: project.title,
        databaseName: project.databaseName,
        parentFolder: project.parentFolder,
      },
    });

    // Drop the project's database if it exists
    if (project.databaseName) {
      try {
        console.log('Dropping database...', {
          ...logContext,
          step: 'database_deletion',
          databaseName: project.databaseName,
        });
        await client.db(project.databaseName).dropDatabase();
        console.log('Database dropped successfully', {
          ...logContext,
          step: 'database_deletion',
          status: 'success',
        });
      } catch (error: any) {
        console.error('Error dropping database', {
          ...logContext,
          step: 'database_deletion',
          status: 'error',
          error: {
            message: error.message,
            code: error.code,
          },
        });
        // If code=26, "ns not found" means DB didn't exist. We can ignore.
        if (error.code !== 26) {
          throw error;
        }
        console.log('Database not found, continuing deletion', {
          ...logContext,
          step: 'database_deletion',
          status: 'skipped',
        });
      }
    }

    // Delete the project's files from R2 if needed (assuming project.filePaths is an array)
    if ((project as any).filePaths && (project as any).filePaths.length > 0) {
      try {
        const filePaths: string[] = (project as any).filePaths;
        console.log('Starting R2 file deletion...', {
          ...logContext,
          step: 'file_deletion',
          fileCount: filePaths.length,
        });
        const deleteObjects = filePaths.map((f) => ({ Key: f }));
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: { Objects: deleteObjects },
        });
        const deleteResult = await s3Client.send(deleteCommand);
        console.log('R2 deletion completed', {
          ...logContext,
          step: 'file_deletion',
          status: 'success',
          result: {
            deletedCount: deleteResult.Deleted?.length || 0,
            errorCount: deleteResult.Errors?.length || 0,
            errors: deleteResult.Errors,
          },
        });
      } catch (error: any) {
        console.error('R2 deletion failed', {
          ...logContext,
          step: 'file_deletion',
          status: 'error',
          error: {
            message: error.message,
            code: error.code,
          },
        });
        throw error;
      }
    } else {
      console.log('No files to delete', {
        ...logContext,
        step: 'file_deletion',
        status: 'skipped',
      });
    }

    // Finally, delete the project doc
    console.log('Deleting project document...', {
      ...logContext,
      step: 'project_deletion',
    });
    const deleteResult = await db.collection<Project>('projects').deleteOne({ _id: new ObjectId(projectId) });
    console.log('Project document deleted', {
      ...logContext,
      step: 'project_deletion',
      status: 'success',
      result: {
        acknowledged: deleteResult.acknowledged,
        deletedCount: deleteResult.deletedCount,
      },
    });

    const endTime = new Date().toISOString();
    const duration = new Date(endTime).getTime() - new Date(startTime).getTime();

    console.log('Project deletion completed', {
      ...logContext,
      step: 'completion',
      status: 'success',
      duration: `${duration}ms`,
      endTime,
    });

    return NextResponse.json({
      success: true,
      message: 'Project, database, and associated files deleted successfully',
      details: {
        projectId,
        title: project.title,
        databaseDropped: true,
        duration: `${duration}ms`,
      },
    });
  } catch (error: any) {
    const endTime = new Date().toISOString();
    const duration = new Date(endTime).getTime() - new Date(startTime).getTime();

    console.error('Project deletion failed', {
      ...logContext,
      step: 'error',
      status: 'failed',
      error: {
        message: error.message,
        code: error.code,
        type: error.constructor.name,
        stack: error.stack,
      },
      duration: `${duration}ms`,
      endTime,
    });

    return NextResponse.json(
      {
        error: 'Failed to delete project',
        details: error.message,
        code: error.code,
        type: error.constructor.name,
      },
      { status: 500 }
    );
  }
}

// =========== GET: Fetch all projects ===========

export async function GET() {
  const startTime = new Date().toISOString();
  const logContext = {
    handler: 'GET /api/admin/projects',
    startTime,
  };

  try {
    console.log('Fetching projects - started', logContext);

    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      console.warn('Unauthorized access attempt', {
        ...logContext,
        error: 'No session or user found'
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has admin role
    if (session.user.role !== 'admin') {
      console.warn('Forbidden access attempt', {
        ...logContext,
        userId: session.user.id,
        userRole: session.user.role
      });
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const { db, client } = await connectToDatabase();
    if (!db || !client) {
      console.error('Database connection failed', {
        ...logContext,
        error: 'Failed to connect to database'
      });
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }

    const projects = await db.collection<Project>('projects').find({}).toArray();

    const endTime = new Date().toISOString();
    console.log('Fetching projects - completed', {
      ...logContext,
      endTime,
      projectCount: projects.length
    });

    return NextResponse.json({
      success: true,
      data: projects,
    });
  } catch (error: any) {
    const endTime = new Date().toISOString();
    console.error('Error fetching projects:', {
      ...logContext,
      endTime,
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code
      }
    });
    return NextResponse.json({ 
      error: 'Failed to fetch projects',
      details: error.message
    }, { status: 500 });
  }
} 