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
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId, Filter, WithId } from 'mongodb';
import { getSocketInstance } from '@/lib/socket';
import { Server } from 'socket.io';
import type { Document, UpdateFilter } from 'mongodb';
import { Worker } from 'worker_threads';
import path from 'path';

// Route Segment Config
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Maximum allowed for hobby plan
export const runtime = 'nodejs';

// Initialize S3 client for R2
const s3Client = new S3Client({
  region: process.env.R2_REGION || 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || '';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
const MAX_CONCURRENT_UPLOADS = 3;
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB

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

interface ProjectData {
  title: string;
  description: string;
  sourceLanguage: string;
  targetLanguage: string;
  videos: File[];
}

interface ErrorResponse {
  error: string;
  details: string;
}

interface UploadProgress {
  fileIndex: number;
  chunkIndex: number;
  bytesUploaded: number;
  totalBytes: number;
}

interface UploadResult {
  fileName: string;
  fileKey: string;
  collectionName: string;
}

interface EpisodeDocument {
  _id: ObjectId;
  name: string;
  collectionName: string;
  videoPath: string;
  videoKey: string;
  status: string;
  uploadedAt: Date;
}

interface MongoProjectDoc {
  insertedId: ObjectId;
  acknowledged: boolean;
}

interface ProjectUpdate {
  episodes?: any[];
  'uploadStatus.completedFiles'?: number;
  'uploadStatus.currentFile'?: number;
  'uploadStatus.status'?: string;
  status?: string;
  updatedAt?: Date;
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const logContext = {
    handler: 'POST /api/admin/projects',
    requestId: `proj_${startTime}`,
    startTime: new Date().toISOString()
  };

  let client = null;
  let projectDoc: MongoProjectDoc | undefined;
  let uploadResults: UploadResult[] = [];

  try {
    console.log('Starting project creation process', {
      ...logContext,
      timestamp: new Date().toISOString()
    });

    // 1. Authorization
    const session = await getServerSession(authOptions);
    console.log('Auth check completed', {
      ...logContext,
      isAuthorized: !!session && session.user.role === 'admin',
      timestamp: new Date().toISOString()
    });

    if (!session || session.user.role !== 'admin') {
      console.warn('Unauthorized project creation attempt', {
        ...logContext,
        userId: session?.user?.id,
        userRole: session?.user?.role
      });
      return NextResponse.json({ 
        success: false,
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    // 2. Parse and validate form data
    const formData = await request.formData();
    console.log('Form data received', {
      ...logContext,
      fields: {
        hasTitle: !!formData.get('title'),
        hasDescription: !!formData.get('description'),
        hasSourceLang: !!formData.get('sourceLanguage'),
        hasTargetLang: !!formData.get('targetLanguage'),
        videoCount: formData.getAll('videos').length
      },
      timestamp: new Date().toISOString()
    });

    const data: ProjectData = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      sourceLanguage: formData.get('sourceLanguage') as string,
      targetLanguage: formData.get('targetLanguage') as string,
      videos: Array.from(formData.getAll('videos')).filter((file): file is File => file instanceof File)
    };

    // Log parsed data
    console.log('Data parsed', {
      ...logContext,
      projectData: {
        title: data.title,
        description: data.description?.substring(0, 50),
        sourceLanguage: data.sourceLanguage,
        targetLanguage: data.targetLanguage,
        videoCount: data.videos.length
      },
      timestamp: new Date().toISOString()
    });

    // Validate required fields
    if (!data.title?.trim() || !data.sourceLanguage?.trim() || !data.targetLanguage?.trim()) {
      console.warn('Missing required fields', {
        ...logContext,
        fields: {
          title: !!data.title?.trim(),
          sourceLanguage: !!data.sourceLanguage?.trim(),
          targetLanguage: !!data.targetLanguage?.trim()
        }
      });
      return NextResponse.json({
        success: false,
        error: 'Missing required fields'
      }, { status: 400 });
    }

    // Validate video files
    if (!data.videos?.length) {
      console.warn('No video files provided', logContext);
      return NextResponse.json({
        success: false,
        error: 'At least one video file is required'
      }, { status: 400 });
    }

    // Validate and log file details
    let totalSize = 0;
    const fileDetails = data.videos.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type
    }));

    console.log('Processing video files', {
      ...logContext,
      files: fileDetails,
      timestamp: new Date().toISOString()
    });

    for (const file of data.videos) {
      if (!file.type.startsWith('video/')) {
        console.warn('Invalid file type', {
          ...logContext,
          fileName: file.name,
          fileType: file.type
        });
        return NextResponse.json({
          success: false,
          error: `Invalid file type for ${file.name}. Only video files are allowed.`
        }, { status: 400 });
      }

      if (file.size > 900 * 1024 * 1024) {
        console.warn('File too large', {
          ...logContext,
          fileName: file.name,
          fileSize: file.size
        });
        return NextResponse.json({
          success: false,
          error: `File ${file.name} is too large. Maximum size is 900MB.`
        }, { status: 400 });
      }

      totalSize += file.size;
    }

    if (totalSize > 10 * 1024 * 1024 * 1024) {
      console.warn('Total size too large', {
        ...logContext,
        totalSize
      });
      return NextResponse.json({
        success: false,
        error: 'Total file size exceeds 10GB limit'
      }, { status: 400 });
    }

    console.log('File validation completed', {
      ...logContext,
      totalSize,
      fileCount: data.videos.length,
      timestamp: new Date().toISOString()
    });

    // 3. Connect to database
    console.log('Connecting to database', {
      ...logContext,
      timestamp: new Date().toISOString()
    });

    const { db, client: mongoClient } = await connectToDatabase();
    client = mongoClient;

    console.log('Database connected', {
      ...logContext,
      timestamp: new Date().toISOString()
    });

    // Start a MongoDB session for transaction
    const mongoSession = client.startSession();
    console.log('MongoDB session started', {
      ...logContext,
      timestamp: new Date().toISOString()
    });

    try {
      const result = await mongoSession.withTransaction(async () => {
        console.log('Starting transaction', {
          ...logContext,
          timestamp: new Date().toISOString()
        });

        // 4. Create project document
        const sanitizedTitle = data.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
        projectDoc = await db.collection('projects').insertOne({
          title: data.title,
          description: data.description || '',
          sourceLanguage: data.sourceLanguage,
          targetLanguage: data.targetLanguage,
          status: 'initializing',
          createdAt: new Date(),
          updatedAt: new Date(),
          assignedTo: [],
          parentFolder: sanitizedTitle,
          databaseName: `${sanitizedTitle}_db`,
          episodes: [],
          uploadStatus: {
            totalFiles: data.videos.length,
            completedFiles: 0,
            currentFile: 0,
            status: 'uploading'
          }
        }, { session: mongoSession });

        console.log('Project document created', {
          ...logContext,
          projectId: projectDoc?.insertedId.toString(),
          timestamp: new Date().toISOString()
        });

        // Track upload IDs for rollback if needed
        const uploadIds: { fileKey: string; uploadId: string }[] = [];

        try {
          // Process videos in parallel with controlled concurrency
          console.log('Starting video processing', {
            ...logContext,
            totalFiles: data.videos.length,
            maxConcurrent: MAX_CONCURRENT_UPLOADS,
            timestamp: new Date().toISOString()
          });

          for (let i = 0; i < data.videos.length; i += MAX_CONCURRENT_UPLOADS) {
            const chunk = data.videos.slice(i, i + MAX_CONCURRENT_UPLOADS);
            console.log('Processing chunk of videos', {
              ...logContext,
              chunkIndex: Math.floor(i / MAX_CONCURRENT_UPLOADS),
              chunkSize: chunk.length,
              startIndex: i,
              timestamp: new Date().toISOString()
            });

            const chunkPromises = chunk.map(async (video, index) => {
              const fileIndex = i + index;
              console.log('Processing video file', {
                ...logContext,
                fileName: video.name,
                fileIndex,
                fileSize: video.size,
                timestamp: new Date().toISOString()
              });

              const fileName = video.name;
              const collectionName = path.basename(fileName, path.extname(fileName));
              const fileKey = `${sanitizedTitle}/${collectionName}/${fileName}`;

              try {
                // Start multipart upload
                const multipartUpload = await s3Client.send(new CreateMultipartUploadCommand({
                  Bucket: BUCKET_NAME,
                  Key: fileKey,
                  ContentType: video.type
                }));

                const uploadId = multipartUpload.UploadId!;
                uploadIds.push({ fileKey, uploadId });

                const fileSize = video.size;
                const numParts = Math.ceil(fileSize / CHUNK_SIZE);
                const parts = [];

                // Upload chunks with progress tracking
                for (let partNumber = 1; partNumber <= numParts; partNumber++) {
                  const start = (partNumber - 1) * CHUNK_SIZE;
                  const end = Math.min(start + CHUNK_SIZE, fileSize);
                  const chunk = video.slice(start, end);
                  
                  try {
                    const chunkBuffer = Buffer.from(await chunk.arrayBuffer());
                    const uploadPartCommand = new UploadPartCommand({
                      Bucket: BUCKET_NAME,
                      Key: fileKey,
                      UploadId: uploadId,
                      PartNumber: partNumber,
                      Body: chunkBuffer
                    });

                    const { ETag } = await s3Client.send(uploadPartCommand);
                    parts.push({ PartNumber: partNumber, ETag });

                    // Update progress
                    const progress: UploadProgress = {
                      fileIndex,
                      chunkIndex: partNumber,
                      bytesUploaded: end,
                      totalBytes: fileSize
                    };
                    
                    // Emit progress through socket if available
                    const io = getSocketInstance();
                    io?.emit('uploadProgress', {
                      projectId: projectDoc?.insertedId.toString(),
                      ...progress
                    });
                  } catch (chunkError) {
                    console.error(`Error uploading chunk ${partNumber} for ${fileName}:`, chunkError);
                    // Abort the multipart upload
                    await s3Client.send(new AbortMultipartUploadCommand({
                      Bucket: BUCKET_NAME,
                      Key: fileKey,
                      UploadId: uploadId
                    }));
                    throw chunkError;
                  }
                }

                // Complete multipart upload
                await s3Client.send(new CompleteMultipartUploadCommand({
                  Bucket: BUCKET_NAME,
                  Key: fileKey,
                  UploadId: uploadId,
                  MultipartUpload: { Parts: parts }
                }));

                // Add episode to project using proper MongoDB update operator
                const episodeDoc = {
                  _id: new ObjectId(),
                  name: fileName,
                  collectionName,
                  videoPath: fileKey,
                  videoKey: fileKey,
                  status: 'uploaded' as const,
                  uploadedAt: new Date()
                };

                await db.collection('projects').updateOne(
                  { _id: projectDoc?.insertedId },
                  {
                    $push: { episodes: episodeDoc },
                    $inc: { 'uploadStatus.completedFiles': 1 },
                    $set: {
                      'uploadStatus.currentFile': fileIndex + 1,
                      updatedAt: new Date()
                    }
                  } as any,
                  { session: mongoSession }
                );

                uploadResults.push({ fileName, fileKey, collectionName });
              } catch (fileError) {
                console.error(`Error processing file ${fileName}:`, fileError);
                throw fileError;
              }
            });

            await Promise.all(chunkPromises);
            console.log('Chunk processing completed', {
              ...logContext,
              chunkIndex: Math.floor(i / MAX_CONCURRENT_UPLOADS),
              timestamp: new Date().toISOString()
            });
          }

          console.log('All videos processed', {
            ...logContext,
            totalProcessed: uploadResults.length,
            timestamp: new Date().toISOString()
          });

          return { projectId: projectDoc.insertedId, uploadResults };
        } catch (uploadError) {
          console.error('Upload error occurred', {
            ...logContext,
            error: uploadError,
            timestamp: new Date().toISOString()
          });
          throw uploadError;
        }
      });

      console.log('Transaction completed', {
        ...logContext,
        timestamp: new Date().toISOString()
      });

      return NextResponse.json({
        success: true,
        data: {
          projectId: projectDoc!.insertedId.toString(),
          uploadResults
        }
      });

    } catch (error) {
      console.error('Transaction failed', {
        ...logContext,
        error,
        timestamp: new Date().toISOString()
      });
      throw error;
    } finally {
      console.log('Cleaning up transaction', {
        ...logContext,
        timestamp: new Date().toISOString()
      });
      await mongoSession.endSession();
    }

  } catch (error: any) {
    console.error('Error in project creation:', {
      ...logContext,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to create project'
    }, { status: 500 });

  } finally {
    if (client) {
      await client.close();
      console.log('Database connection closed', {
        ...logContext,
        step: 'cleanup',
        timestamp: new Date().toISOString(),
        duration: `${Date.now() - startTime}ms`
      });
    }
  }
}

// =========== DELETE: Project Deletion ===========

export async function DELETE(request: NextRequest): Promise<NextResponse> {
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

export async function GET(): Promise<NextResponse> {
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
        error: 'No session or user found',
        sessionExists: !!session,
        userExists: !!session?.user,
        timestamp: new Date().toISOString()
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Log session details
    console.log('Session details:', {
      ...logContext,
      userId: session.user.id,
      username: session.user.username,
      role: session.user.role,
      timestamp: new Date().toISOString()
    });

    // Check if user has admin role
    if (session.user.role !== 'admin') {
      console.warn('Forbidden access attempt', {
        ...logContext,
        userId: session.user.id,
        userRole: session.user.role,
        requiredRole: 'admin',
        timestamp: new Date().toISOString()
      });
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const { db, client } = await connectToDatabase();
    if (!db || !client) {
      console.error('Database connection failed', {
        ...logContext,
        error: 'Failed to connect to database',
        dbExists: !!db,
        clientExists: !!client,
        timestamp: new Date().toISOString()
      });
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }

    // Log successful database connection
    console.log('Database connection established', {
      ...logContext,
      timestamp: new Date().toISOString()
    });

    // Add error handling for the database query
    try {
      const projects = await db.collection<Project>('projects')
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

      const endTime = new Date().toISOString();
      console.log('Fetching projects - completed', {
        ...logContext,
        endTime,
        projectCount: projects.length,
        success: true
      });

      return NextResponse.json({
        success: true,
        data: projects,
        metadata: {
          count: projects.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (dbError: any) {
      console.error('Database query error:', {
        ...logContext,
        error: {
          message: dbError.message,
          code: dbError.code,
          timestamp: new Date().toISOString()
        }
      });
      return NextResponse.json({ 
        error: 'Database query failed',
        details: dbError.message
      }, { status: 500 });
    }
  } catch (error: any) {
    const endTime = new Date().toISOString();
    console.error('Error fetching projects:', {
      ...logContext,
      endTime,
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        type: error.constructor.name
      }
    });
    return NextResponse.json({ 
      error: 'Failed to fetch projects',
      details: error.message
    }, { status: 500 });
  } finally {
    // Log memory usage
    const used = process.memoryUsage();
    console.log('Memory usage:', {
      ...logContext,
      memory: {
        rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(used.external / 1024 / 1024)}MB`,
      },
      timestamp: new Date().toISOString()
    });
  }
} 