import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

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

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const videoFile = formData.get('video') as File;
    let videoPath = '';
    let videoKey = '';

    // Extract project data
    const projectData = {
      title: formData.get('title'),
      description: formData.get('description'),
      sourceLanguage: formData.get('sourceLanguage'),
      targetLanguage: formData.get('targetLanguage'),
      dialogue_collection: formData.get('dialogue_collection'),
      status: formData.get('status'),
    };

    // Get metadata
    const metadata = JSON.parse(formData.get('metadata') as string);
    const { currentFile, collections, filePaths, parentFolder } = metadata;
    const { isFirst, isLast, projectId } = currentFile;

    if (videoFile) {
      try {
        // Generate folder path using parent folder structure
        const collectionName = videoFile.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, '_');
        const folderPath = `${parentFolder}/${collectionName}/`;
        const key = `${folderPath}${videoFile.name}`;
        videoKey = key;

        // Convert File to Buffer
        const arrayBuffer = await videoFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload to R2
        const putCommand = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: buffer,
          ContentType: videoFile.type,
        });

        await s3Client.send(putCommand);

        // Generate a signed URL for the uploaded file
        const getCommand = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        });

        const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
        videoPath = signedUrl;
      } catch (uploadError: any) {
        console.error('Error uploading video:', uploadError);
        return NextResponse.json(
          { error: 'Failed to upload video', details: uploadError.message },
          { status: 500 }
        );
      }
    }

    // Connect to MongoDB
    const { db, client } = await connectToDatabase();
    
    // Create a new database with the project title only for the first file
    const databaseName = metadata.databaseName;
    console.log('Processing project:', { databaseName, isFirst, isLast, projectId });
    
    try {
      if (isFirst) {
        // Create new database instance
        const newDb = client.db(databaseName);
        console.log('Database instance created:', databaseName);

        // Create collections for all files at once
        for (const collectionName of collections) {
          try {
            await newDb.createCollection(collectionName);
            console.log(`Created empty collection: ${collectionName} in database: ${databaseName}`);
          } catch (collectionError: any) {
            console.error(`Error creating collection ${collectionName}:`, collectionError);
            throw collectionError;
          }
        }

        // Create initial project document
        const result = await db.collection('projects').insertOne({
          ...projectData,
          videoPath,
          videoKey,
          createdAt: new Date(),
          updatedAt: new Date(),
          assignedTo: [],
          parentFolder,
          filePaths: [videoKey], // Start with first file
          databaseName,
          collections,
        });

        return NextResponse.json({
          success: true,
          data: {
            _id: result.insertedId,
            ...projectData,
            videoPath,
            videoKey,
            parentFolder,
            filePaths: [videoKey],
            databaseName,
            collections,
          },
        });
      } else {
        // For subsequent files, update the existing project document using projectId
        if (!projectId) {
          throw new Error('Project ID is required for subsequent file uploads');
        }

        const existingProject = await db.collection('projects').findOne({
          _id: new ObjectId(projectId)
        });

        if (!existingProject) {
          throw new Error(`Project with ID ${projectId} not found for subsequent file upload`);
        }

        // Update the project with the new file path
        const updateResult = await db.collection('projects').updateOne(
          { _id: existingProject._id },
          { 
            $addToSet: { filePaths: videoKey },
            $set: { updatedAt: new Date() }
          }
        );

        if (!updateResult.matchedCount) {
          throw new Error('Failed to update project with new file path');
        }

        return NextResponse.json({
          success: true,
          data: {
            _id: existingProject._id,
            videoPath,
            videoKey,
          },
        });
      }

    } catch (error: any) {
      console.error('Detailed error:', {
        error: error.message,
        code: error.code,
        stack: error.stack,
        databaseName,
        projectData,
        collections
      });
      
      // Try to clean up if database was partially created
      try {
        if (isFirst && client.db(databaseName)) {
          await client.db(databaseName).dropDatabase();
          console.log('Cleaned up partially created database:', databaseName);
        }
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError);
      }

      return NextResponse.json(
        { 
          error: 'Failed to create project',
          details: error.message,
          code: error.code
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Error in main try block:', {
      error: error.message,
      code: error.code,
      stack: error.stack
    });
    return NextResponse.json(
      { 
        error: 'Failed to create project',
        details: error.message,
        code: error.code
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