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
    // Step 0: Authorization check
    const authSession = await getServerSession(authOptions);
    if (!authSession || !authSession.user || authSession.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    videoFile = formData.get('video') as File;

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
      console.log(`[${new Date().toISOString()}] Starting new project initialization:`, {
        title: projectData.title,
        totalFiles: collections.length
      });

      // Step 1: Create parent folder name (sanitize title for folder name)
      const parentFolder = projectData.title.replace(/[^a-zA-Z0-9-_]/g, '_');
      console.log(`[${new Date().toISOString()}] Step 1: Created parent folder name: ${parentFolder}`);

      // Step 2: Create project document in MongoDB
      const { db, client } = await connectToDatabase();
      const mongoSession = await client.startSession();

      try {
        await mongoSession.withTransaction(async () => {
          // Check if project already exists
          const existingProject = await db.collection('projects').findOne({
            title: projectData.title,
            parentFolder: parentFolder
          });

          if (existingProject) {
            throw new Error('Project with this title already exists');
          }

          // Create initial project document
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

          console.log(`[${new Date().toISOString()}] Step 2: Created project document:`, {
            projectId: result.insertedId,
            title: projectData.title
          });

          // Step 3: Create database
          if (!/^[a-zA-Z0-9_-]+$/.test(parentFolder)) {
            throw new Error('Invalid database name. Use only letters, numbers, underscores, and hyphens');
          }

          const newDb = client.db(parentFolder);
          console.log(`[${new Date().toISOString()}] Step 3: Created database: ${parentFolder}`);

          // Update project status to ready for upload
          await db.collection<ProjectDocument>('projects').updateOne(
            { _id: result.insertedId },
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

        // Upload to R2
        const arrayBuffer = await videoFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const putCommand = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: buffer,
          ContentType: videoFile.type,
        });

        await s3Client.send(putCommand);
        console.log(`[${new Date().toISOString()}] Uploaded file to R2:`, { key });

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

        // Update project with new episode
        const result = await db.collection<ProjectDocument>('projects').findOneAndUpdate(
          { _id: project._id },
          {
            $push: {
              episodes: {
                $each: uploadedFiles.map(file => ({
                  name: file.name,
                  collectionName: file.collectionName,
                  videoPath: file.videoPath,
                  videoKey: file.videoKey,
                  status: 'uploaded',
                  uploadedAt: new Date()
                }))
              }
            },
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

        if (!result) {
          throw new Error('Failed to update project');
        }

        transactionResult = result;

        // If this is the last file, create collections for all episodes
        if (isLast) {
          console.log(`[${new Date().toISOString()}] Creating collections for all episodes`);
          const allEpisodes = result.episodes || [];
          
          for (const episode of allEpisodes) {
            const collectionName = episode.collectionName;
            const newCollection = client.db(project.databaseName).collection(collectionName);
            console.log(`[${new Date().toISOString()}] Created collection: ${collectionName}`);
          }
        }
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