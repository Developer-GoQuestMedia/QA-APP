import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId, WithId, ClientSession } from 'mongodb';

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

// Helper function to delete folder and its contents from R2
async function deleteR2Folder(folderPath: string) {
  try {
    // List all objects in the folder
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

interface Episode {
  _id?: string;  // Make _id optional since it's added when creating new episodes
  name: string;
  collectionName: string;
  videoPath: string;
  videoKey: string;
  status: 'uploaded' | 'processing' | 'error';
  uploadedAt: Date;
}

interface ProjectDocument {
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

// Add memory monitoring for Node.js
function logMemoryUsage() {
  const used = process.memoryUsage();
  console.log('Memory usage:', {
    rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(used.external / 1024 / 1024)}MB`
  });
}

// Constants for file upload limits
const MAX_FILE_SIZE = 800 * 1024 * 1024; // 800MB
const MAX_TOTAL_SIZE = 10 * 1024 * 1024 * 1024; // 10GB

// Add helper function to check if file exists in R2
async function checkFileExistsInR2(key: string) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });
    await s3Client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      return false;
    }
    throw error;
  }
}

async function ensureDatabaseAndCollection(client: any, databaseName: string, collectionName: string) {
  try {
    // Check if database exists by trying to use it
    const db = client.db(databaseName);
    
    // Check if collection exists
    const collections = await db.listCollections({ name: collectionName }).toArray();
    const collectionExists = collections.length > 0;
    
    if (!collectionExists) {
      console.log(`[${new Date().toISOString()}] Creating collection ${collectionName} in database ${databaseName}`);
      const newCollection = await db.createCollection(collectionName);
      
      // Write a placeholder document to ensure collection is created
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

// Add helper function to ensure episode exists in database
async function ensureEpisodeInDatabase(client: any, projectId: string, episode: Episode) {
  try {
    const { db } = await connectToDatabase();
    
    // Update project with episode info
    const result = await db.collection('projects').findOneAndUpdate(
      { _id: new ObjectId(projectId) },
      {
        $addToSet: { // Use addToSet to avoid duplicates
          episodes: {
            _id: new ObjectId(), // Add unique ID for each episode
            ...episode,
            status: 'uploaded',
            uploadedAt: new Date()
          }
        }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      throw new Error('Failed to update project with episode');
    }

    // Ensure database exists for the project
    const projectDb = client.db(result.databaseName);
    
    // Create collection for episode if it doesn't exist
    const collections = await projectDb.listCollections({ name: episode.collectionName }).toArray();
    if (collections.length === 0) {
      const collection = await projectDb.createCollection(episode.collectionName);
      
      // Create initial document in collection
      await collection.insertOne({
        episodeId: episode._id,
        name: episode.name,
        videoPath: episode.videoPath,
        videoKey: episode.videoKey,
        status: 'uploaded',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          projectId: result._id,
          collectionName: episode.collectionName
        }
      });
    }

    return result;
  } catch (error) {
    console.error('Error ensuring episode in database:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let videoFile: File | null = null;
  const uploadedFiles: Array<{
    name: string;
    videoPath: string;
    videoKey: string;
    collectionName: string;
  }> = [];

  try {
    // Log initial memory usage
    logMemoryUsage();

    // Step 0: Authorization check
    const authSession = await getServerSession(authOptions);
    if (!authSession || !authSession.user || authSession.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    videoFile = formData.get('video') as File;

    // Validate file size
    if (videoFile && videoFile.size > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        error: `File size exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB` 
      }, { status: 400 });
    }

    // Extract project data
    const projectData = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      sourceLanguage: formData.get('sourceLanguage') as string,
      targetLanguage: formData.get('targetLanguage') as string,
      status: 'initializing' as const
    };

    // Get metadata
    const metadata = JSON.parse(formData.get('metadata') as string);
    const { currentFile, collections, filePaths } = metadata;
    const { isFirst, isLast, projectId, index } = currentFile;

    // Only proceed with initialization steps if this is the first file
    if (isFirst) {
      console.log(`[${new Date().toISOString()}] Starting project initialization:`, {
        title: projectData.title,
        totalFiles: collections.length
      });

      const parentFolder = projectData.title.replace(/[^a-zA-Z0-9-_]/g, '_');
      const { db, client } = await connectToDatabase();
      const mongoSession = await client.startSession();

      try {
        await mongoSession.withTransaction(async () => {
          const existingProject = await db.collection('projects').findOne({
            title: projectData.title,
            parentFolder: parentFolder
          });

          if (existingProject) {
            console.log(`[${new Date().toISOString()}] Found existing project, checking files...`);
            
            // Check if this specific file exists in R2
            if (!videoFile) {
              throw new Error('No video file provided');
            }
            
            const collectionName = videoFile.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, '_');
            const filePath = `${parentFolder}/${collectionName}/${videoFile.name}`;
            const fileExists = await checkFileExistsInR2(filePath);

            if (fileExists) {
              throw new Error('File already exists in this project');
            }

            // Check if collection exists and create if it doesn't
            const collectionExists = existingProject.episodes.some(
              (ep: Episode) => ep.collectionName === collectionName
            );

            if (collectionExists) {
              throw new Error('Collection already exists in this project');
            }

            // Ensure database and collection exist
            await ensureDatabaseAndCollection(client, existingProject.databaseName, collectionName);

            console.log(`[${new Date().toISOString()}] Continuing with existing project:`, {
              projectId: existingProject._id,
              title: existingProject.title,
              database: existingProject.databaseName,
              collection: collectionName
            });
            
            // Update project status
            await db.collection('projects').updateOne(
              { _id: existingProject._id },
              { 
                $set: { 
                  status: 'uploading',
                  uploadStatus: {
                    totalFiles: collections.length,
                    completedFiles: existingProject.episodes.length,
                    currentFile: index,
                    status: 'uploading'
                  }
                }
              }
            );
          } else {
            // Create new project
            const result = await db.collection<ProjectDocument>('projects').insertOne({
              ...projectData,
              createdAt: new Date(),
              updatedAt: new Date(),
              assignedTo: [],
              parentFolder: parentFolder,
              databaseName: parentFolder,
              episodes: [],
              uploadStatus: {
                totalFiles: collections.length,
                completedFiles: 0,
                currentFile: -1,
                status: 'initializing'
              }
            }, { session: mongoSession });

            // Create database and initial collection
            if (!/^[a-zA-Z0-9_-]+$/.test(parentFolder)) {
              throw new Error('Invalid database name. Use only letters, numbers, underscores, and hyphens');
            }

            if (!videoFile) {
              throw new Error('No video file provided');
            }

            const collectionName = videoFile.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, '_');
            await ensureDatabaseAndCollection(client, parentFolder, collectionName);

            console.log(`[${new Date().toISOString()}] Created new project with database and collection:`, {
              projectId: result.insertedId,
              title: projectData.title,
              database: parentFolder,
              collection: collectionName
            });
          }

          // Update project status to ready for upload
          await db.collection<ProjectDocument>('projects').updateOne(
            { title: projectData.title },
            { $set: { status: 'uploading' } },
            { session: mongoSession }
          );
        });
      } finally {
        await mongoSession.endSession();
      }
    }

    // Step 4: Upload file to R2 and create folder
    if (videoFile) {
      console.log(`[${new Date().toISOString()}] Step 4: Processing file ${index + 1}/${collections.length}:`, {
        fileName: videoFile.name
      });

      try {
        // Generate folder path using parent folder structure
        const collectionName = videoFile.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, '_');
        const parentFolder = projectData.title.replace(/[^a-zA-Z0-9-_]/g, '_');
        const folderPath = `${parentFolder}/${collectionName}/`;
        const key = `${folderPath}${videoFile.name}`;

        // Process file in chunks to manage memory better
        let buffer: Buffer;
        {
          // Create a new scope to help with garbage collection
          const arrayBuffer = await videoFile.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
        } // arrayBuffer should be garbage collected after this block

        // Upload to R2
        const putCommand = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: buffer,
          ContentType: videoFile.type,
        });

        await s3Client.send(putCommand);
        console.log(`[${new Date().toISOString()}] Uploaded file to R2:`, { key });

        // Clear references to help garbage collection
        buffer = Buffer.alloc(0);

        // Generate signed URL
        const getCommand = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        });

        const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

        uploadedFiles.push({
          name: videoFile.name,
          videoPath: signedUrl,
          videoKey: key,
          collectionName
        });

        // Force garbage collection if available
        if (global.gc) {
          try {
            global.gc();
          } catch (e) {
            console.error('Failed to force garbage collection:', e);
          }
        }

      } catch (uploadError: any) {
        console.error(`[${new Date().toISOString()}] R2 upload error:`, uploadError);
        throw uploadError;
      }
    }

    // Step 5: Update project and create collections if last file
    const { db, client } = await connectToDatabase();
    const mongoSession = await client.startSession();

    try {
      let transactionResult;
      await mongoSession.withTransaction(async () => {
        // Find the project
        const project = await db.collection<ProjectDocument>('projects').findOne({
          title: projectData.title,
          parentFolder: projectData.title.replace(/[^a-zA-Z0-9-_]/g, '_')
        });

        if (!project) {
          throw new Error('Project not found');
        }

        // Ensure each uploaded file is properly added to database
        for (const file of uploadedFiles) {
          await ensureEpisodeInDatabase(client, project._id.toString(), {
            name: file.name,
            collectionName: file.collectionName,
            videoPath: file.videoPath,
            videoKey: file.videoKey,
            status: 'uploaded',
            uploadedAt: new Date()
          });
        }

        // Update project status
        transactionResult = await db.collection<ProjectDocument>('projects').findOneAndUpdate(
          { _id: project._id },
          {
            $set: {
              updatedAt: new Date(),
              uploadStatus: {
                totalFiles: collections.length,
                completedFiles: index + 1,
                currentFile: index,
                status: isLast ? 'completed' : 'uploading'
              },
              status: isLast ? 'pending' : 'uploading'
            }
          },
          {
            returnDocument: 'after',
            session: mongoSession
          }
        );

        if (!transactionResult) {
          throw new Error('Failed to update project');
        }

        console.log(`[${new Date().toISOString()}] Updated project status:`, {
          projectId: project._id,
          status: isLast ? 'completed' : 'uploading',
          completedFiles: index + 1,
          totalFiles: collections.length
        });
      });

      return NextResponse.json({
        success: true,
        data: transactionResult
      });
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] Operation error:`, {
        error: error.message,
        code: error.code,
        stack: error.stack
      });
      throw error;
    } finally {
      await mongoSession.endSession();
    }
  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] Error processing request after ${((Date.now() - startTime) / 1000).toFixed(1)}s:`, {
      error: error.message,
      code: error.code,
      stack: error.stack
    });

    return NextResponse.json(
      {
        error: 'Failed to process request',
        details: error.message,
        code: error.code,
        file: videoFile?.name || 'unknown'
      },
      { status: 500 }
    );
  } finally {
    // Cleanup and force garbage collection if available
    if (global.gc) {
      try {
        global.gc();
      } catch (e) {
        console.error('Failed to force garbage collection:', e);
      }
    }
    
    // Final memory usage log
    logMemoryUsage();
  }
}

export async function DELETE(request: NextRequest) {
  const startTime = new Date().toISOString();
  const logContext = {
    timestamp: startTime,
    endpoint: 'DELETE /api/admin/projects'
  };

  try {
    console.log('Starting project deletion process...', {
      ...logContext,
      step: 'initialization'
    });

    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== 'admin') {
      console.log('Unauthorized deletion attempt:', {
        ...logContext,
        step: 'authorization',
        user: session?.user,
        status: 'rejected'
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Add user info to log context
    Object.assign(logContext, {
      userId: session.user.id,
      userRole: session.user.role
    });

    // Get project ID from the URL
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('id');

    if (!projectId) {
      console.log('Missing project ID in delete request', {
        ...logContext,
        step: 'validation',
        status: 'rejected'
      });
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    Object.assign(logContext, { projectId });

    console.log('Connecting to database...', {
      ...logContext,
      step: 'database_connection'
    });
    const { db, client } = await connectToDatabase();

    // Get project details before deletion
    console.log('Fetching project details...', {
      ...logContext,
      step: 'project_lookup'
    });
    const project = await db.collection('projects').findOne({ _id: new ObjectId(projectId) });

    if (!project) {
      console.log('Project not found', {
        ...logContext,
        step: 'project_lookup',
        status: 'not_found'
      });
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Add project info to log context
    Object.assign(logContext, {
      projectTitle: project.title,
      databaseName: project.databaseName,
      fileCount: project.filePaths?.length || 0
    });

    console.log('Project found', {
      ...logContext,
      step: 'project_lookup',
      status: 'success',
      project: {
        title: project.title,
        databaseName: project.databaseName,
        collections: project.collections,
        parentFolder: project.parentFolder,
        fileCount: project.filePaths?.length || 0
      }
    });

    // Drop the project's database if it exists
    if (project.databaseName) {
      try {
        console.log('Dropping database...', {
          ...logContext,
          step: 'database_deletion',
          databaseName: project.databaseName
        });
        await client.db(project.databaseName).dropDatabase();
        console.log('Database dropped successfully', {
          ...logContext,
          step: 'database_deletion',
          status: 'success'
        });
      } catch (error: any) {
        console.error('Error dropping database', {
          ...logContext,
          step: 'database_deletion',
          status: 'error',
          error: {
            message: error.message,
            code: error.code
          }
        });
        if (error.code !== 26) {
          throw error;
        }
        console.log('Database not found, continuing deletion', {
          ...logContext,
          step: 'database_deletion',
          status: 'skipped'
        });
      }
    }

    // Delete the project's specific files from R2
    if (project.filePaths && project.filePaths.length > 0) {
      try {
        console.log('Starting R2 file deletion...', {
          ...logContext,
          step: 'file_deletion',
          fileCount: project.filePaths.length
        });

        const deleteObjects = project.filePaths.map((filePath: string) => ({ Key: filePath }));

        const deleteCommand = new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: { Objects: deleteObjects }
        });

        const deleteResult = await s3Client.send(deleteCommand);
        console.log('R2 deletion completed', {
          ...logContext,
          step: 'file_deletion',
          status: 'success',
          result: {
            deletedCount: deleteResult.Deleted?.length || 0,
            errorCount: deleteResult.Errors?.length || 0,
            errors: deleteResult.Errors
          }
        });
      } catch (error: any) {
        console.error('R2 deletion failed', {
          ...logContext,
          step: 'file_deletion',
          status: 'error',
          error: {
            message: error.message,
            code: error.code
          }
        });
        throw error;
      }
    } else {
      console.log('No files to delete', {
        ...logContext,
        step: 'file_deletion',
        status: 'skipped'
      });
    }

    // Delete the project from MongoDB
    console.log('Deleting project document...', {
      ...logContext,
      step: 'project_deletion'
    });
    const deleteResult = await db.collection('projects').deleteOne({ _id: new ObjectId(projectId) });
    console.log('Project document deleted', {
      ...logContext,
      step: 'project_deletion',
      status: 'success',
      result: {
        acknowledged: deleteResult.acknowledged,
        deletedCount: deleteResult.deletedCount
      }
    });

    const endTime = new Date().toISOString();
    const duration = new Date(endTime).getTime() - new Date(startTime).getTime();

    console.log('Project deletion completed', {
      ...logContext,
      step: 'completion',
      status: 'success',
      duration: `${duration}ms`,
      endTime
    });

    return NextResponse.json({
      success: true,
      message: 'Project, database, and associated files deleted successfully',
      details: {
        projectId,
        title: project.title,
        databaseDropped: true,
        filesDeleted: project.filePaths?.length || 0,
        duration: `${duration}ms`
      }
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
        stack: error.stack
      },
      duration: `${duration}ms`,
      endTime
    });

    return NextResponse.json(
      {
        error: 'Failed to delete project',
        details: error.message,
        code: error.code,
        type: error.constructor.name
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const projects = await db.collection('projects').find({}).toArray();

    return NextResponse.json({
      success: true,
      data: projects,
    });

  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
} 