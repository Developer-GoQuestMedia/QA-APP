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
import { ObjectId, Filter } from 'mongodb';
import { getSocketInstance } from '@/lib/socket';
import { Server } from 'socket.io';

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
  _id?: string;
  name: string;
  collectionName: string;
  videoPath: string;
  videoKey: string;
  status: 'uploaded' | 'processing' | 'error';
  uploadedAt: Date;
}

interface ProjectDocument {
  _id?: ObjectId;
  title: string;
  description: string;
  sourceLanguage: string;
  targetLanguage: string;
  dialogue_collection?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  assignedTo: any[];
  parentFolder: string;
  databaseName: string;
  episodes: Episode[];
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

  const filter: Filter<ProjectDocument> = { _id: new ObjectId(projectId) };

  // Update project with a new or existing episode
  const result = await db
    .collection<ProjectDocument>('projects')
    .findOneAndUpdate(
      filter,
      {
        $addToSet: {
          episodes: {
            _id: new ObjectId().toHexString(),
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
async function* streamFile(file: File, chunkSize = 5 * 1024 * 1024) {
  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + chunkSize);
    const arrayBuffer = await chunk.arrayBuffer();
    yield Buffer.from(arrayBuffer);
    offset += chunkSize;
  }
}

// =========== POST: Upload Route ===========

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let io: Server | null = null;
  try {
    io = getSocketInstance();
  } catch (error) {
    console.warn('Socket.IO not initialized, continuing without real-time updates');
  }

  logMemoryUsage(); // Initial memory usage

  try {
    // 1. Authorization
    const authSession = await getServerSession(authOptions);
    if (!authSession || !authSession.user || authSession.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse FormData
    const formData = await request.formData();
    const rawVideo = formData.get('video');
    if (!rawVideo || !(rawVideo instanceof File)) {
      return NextResponse.json({ error: 'No video file found' }, { status: 400 });
    }
    const videoFile = rawVideo as File;

    if (videoFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File size exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        { status: 400 }
      );
    }

    // 3. Project data
    const projectData = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      sourceLanguage: formData.get('sourceLanguage') as string,
      targetLanguage: formData.get('targetLanguage') as string,
      status: 'initializing' as const,
    };

    // 4. Additional metadata
    const metadata = JSON.parse(formData.get('metadata') as string);
    const { currentFile, collections } = metadata;
    const { isFirst, isLast, projectId, index } = currentFile;
    const parentFolder = projectData.title.replace(/[^a-zA-Z0-9-_]/g, '_');

    const { db, client } = await connectToDatabase();

    // 5. Possibly initialize or continue project
    const mongoSession = client.startSession();
    await mongoSession.withTransaction(async () => {
      if (isFirst) {
        const existingProject = await db
          .collection<ProjectDocument>('projects')
          .findOne({ title: projectData.title, parentFolder });

        if (!existingProject) {
          // Create a new project doc
          const insertion = await db.collection<ProjectDocument>('projects').insertOne(
            {
              ...projectData,
              createdAt: new Date(),
              updatedAt: new Date(),
              assignedTo: [],
              parentFolder,
              databaseName: parentFolder,
              episodes: [],
              uploadStatus: {
                totalFiles: collections.length,
                completedFiles: 0,
                currentFile: -1,
                status: 'initializing',
              },
            },
            { session: mongoSession }
          );

          // Ensure DB + collection exist for the first file
          const collectionName = videoFile.name
            .replace(/\.[^/.]+$/, '')
            .replace(/[^a-zA-Z0-9-_]/g, '_');
          await ensureDatabaseAndCollection(client, parentFolder, collectionName);

          // Update project status to 'uploading'
          await db.collection<ProjectDocument>('projects').updateOne(
            { _id: insertion.insertedId },
            { $set: { status: 'uploading' } },
            { session: mongoSession }
          );

          // Socket event for newly created project
          io?.emit('projectInit', {
            projectId: insertion.insertedId,
            title: projectData.title,
            totalFiles: collections.length,
          });
        } else {
          // If it already existed, just update status
          await db.collection<ProjectDocument>('projects').updateOne(
            { _id: existingProject._id },
            {
              $set: {
                status: 'uploading',
                'uploadStatus.totalFiles': collections.length,
                'uploadStatus.currentFile': index,
              },
            },
            { session: mongoSession }
          );
        }
      }
    });
    await mongoSession.endSession();

    // 6. Multipart upload to R2
    const collectionName = videoFile.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]/g, '_');
    const folderPath = `${parentFolder}/${collectionName}/`;
    const key = `${folderPath}${videoFile.name}`;

    // Check if the file already exists on R2
    const fileExists = await checkFileExistsInR2(key);
    if (fileExists) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: 'File already exists, skipping upload',
        data: { key },
      });
    }

    // Create a multipart upload
    const multipartUpload = await s3Client.send(
      new CreateMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: videoFile.type,
      })
    );
    const uploadId = multipartUpload.UploadId!;
    const parts: { ETag: string; PartNumber: number }[] = [];
    let partNumber = 1;

    // For progress updates
    const chunkSize = 5 * 1024 * 1024;
    const totalChunks = Math.ceil(videoFile.size / chunkSize);
    let uploadedBytes = 0;

    // Upload chunk by chunk
    for await (const chunk of streamFile(videoFile, chunkSize)) {
      const uploadPartResponse = await s3Client.send(
        new UploadPartCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: chunk,
        })
      );

      parts.push({
        ETag: uploadPartResponse.ETag!,
        PartNumber: partNumber,
      });

      uploadedBytes += chunk.length;
      const progressPercent = Math.round((uploadedBytes / videoFile.size) * 100);

      // Emit partial progress (only if Socket.IO is available)
      if (io) {
        io.to(`project-${projectId}`).emit('uploadProgress', {
          projectId,
          fileName: videoFile.name,
          collectionName,
          partNumber,
          totalChunks,
          progressPercent,
          uploadedBytes,
          totalBytes: videoFile.size,
        });
      }

      partNumber++;
    }

    // Complete the multipart upload
    await s3Client.send(
      new CompleteMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      })
    );

    console.log(`Uploaded file to R2: ${key}`);
    console.log(`Uploaded file to R2: ${uploadId}`);

    // Generate short-lived signed URL
    const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }), {
      expiresIn: 3600,
    });

    // Record the file we just uploaded
    const uploadedFiles = [
      {
        name: videoFile.name,
        videoPath: signedUrl,
        videoKey: key,
        collectionName,
      },
    ];

    // 7. Update project doc in Mongo
    const sessionUpdate = client.startSession();
    let finalProjectDoc: ProjectDocument | null = null;

    await sessionUpdate.withTransaction(async () => {
      const project = await db
        .collection<ProjectDocument>('projects')
        .findOne({ title: projectData.title, parentFolder });
      if (!project) {
        throw new Error('Project not found after upload');
      }

      // Ensure episodes are in DB
      for (const file of uploadedFiles) {
        await ensureEpisodeInDatabase(client, project._id!.toString(), {
          name: file.name,
          collectionName: file.collectionName,
          videoPath: file.videoPath,
          videoKey: file.videoKey,
          status: 'uploaded',
          uploadedAt: new Date(),
        });
      }

      // Update the project's upload status
      const updated = await db
        .collection<ProjectDocument>('projects')
        .findOneAndUpdate(
          { _id: project._id },
          {
            $set: {
              updatedAt: new Date(),
              'uploadStatus.completedFiles': index + 1,
              'uploadStatus.currentFile': index,
              'uploadStatus.status': isLast ? 'completed' : 'uploading',
              status: isLast ? 'pending' : 'uploading',
            },
          },
          { returnDocument: 'after', session: sessionUpdate }
        );

      if (!updated) {
        throw new Error('Failed to update project status');
      }
      finalProjectDoc = updated;
    });
    await sessionUpdate.endSession();

    // 8. Emit final/partial completion events (only if Socket.IO is available)
    if (io) {
      if (isLast) {
        io.to(`project-${projectId}`).emit('uploadComplete', {
          projectId,
          totalFiles: collections.length,
        });
      } else {
        io.to(`project-${projectId}`).emit('uploadFileDone', {
          projectId,
          fileName: videoFile.name,
          index,
        });
      }
    }

    // Response
    return NextResponse.json({
      success: true,
      data: finalProjectDoc || {},
    });
  } catch (error: any) {
    console.error(`Error processing request after ${((Date.now() - startTime) / 1000).toFixed(1)}s:`, {
      message: error.message,
      stack: error.stack,
      code: error.code,
      name: error.name,
      // Add detailed error info
      details: error.details || 'No additional details',
      type: error.constructor.name,
      mongoError: error.mongoError || null,
      r2Error: error.r2Error || null
    });
    
    // Send more detailed error response
    return NextResponse.json(
      {
        error: 'Failed to process request',
        details: error.message,
        errorType: error.constructor.name,
        errorCode: error.code,
        mongoError: error.mongoError?.message,
        r2Error: error.r2Error?.message
      },
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
    const project = await db.collection('projects').findOne({ _id: new ObjectId(projectId) });

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
    const deleteResult = await db.collection('projects').deleteOne({ _id: new ObjectId(projectId) });
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
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const projects = await db.collection<ProjectDocument>('projects').find({}).toArray();

    return NextResponse.json({
      success: true,
      data: projects,
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
} 