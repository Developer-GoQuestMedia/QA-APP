import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

// Initialize S3 client for R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
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
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get form data
    const formData = await request.formData();
    
    // Extract project data
    const projectData = {
      title: formData.get('title'),
      description: formData.get('description'),
      sourceLanguage: formData.get('sourceLanguage'),
      targetLanguage: formData.get('targetLanguage'),
      dialogue_collection: formData.get('dialogue_collection'),
      status: formData.get('status'),
      videoPath: formData.get('videoPath'),
    };

    // Validate required fields
    const requiredFields = ['title', 'description', 'sourceLanguage', 'targetLanguage', 'dialogue_collection'];
    const missingFields = requiredFields.filter(field => !projectData[field as keyof typeof projectData]);
    
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    // Handle video upload if present
    const videoFile = formData.get('video') as File | null;
    let videoPath = projectData.videoPath;

    if (videoFile) {
      try {
        // Generate folder path based on collection name
        const folderPath = `${projectData.dialogue_collection}/videos/`;
        
        // Generate a unique filename
        const fileExtension = videoFile.name.split('.').pop();
        const uniqueFilename = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
        const key = `${folderPath}${uniqueFilename}`;

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
        const getCommand = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        });

        videoPath = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 }); // URL expires in 1 hour
      } catch (uploadError) {
        console.error('Error uploading video:', uploadError);
        return NextResponse.json(
          { error: 'Failed to upload video' },
          { status: 500 }
        );
      }
    }

    // Connect to MongoDB
    const { db } = await connectToDatabase();

    // Create project with video path
    const result = await db.collection('projects').insertOne({
      ...projectData,
      videoPath,
      createdAt: new Date(),
      updatedAt: new Date(),
      assignedTo: [],
      folderPath: `${projectData.dialogue_collection}/videos/`, // Store the folder path
    });

    return NextResponse.json({
      success: true,
      data: {
        _id: result.insertedId,
        ...projectData,
        videoPath,
        folderPath: `${projectData.dialogue_collection}/videos/`,
      },
    });

  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get project ID from the URL
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('id');

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    // Get project details before deletion
    const project = await db.collection('projects').findOne({ _id: new ObjectId(projectId) });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Delete the project's folder from R2
    if (project.folderPath) {
      await deleteR2Folder(project.folderPath);
    }

    // Delete the project from MongoDB
    await db.collection('projects').deleteOne({ _id: new ObjectId(projectId) });

    return NextResponse.json({
      success: true,
      message: 'Project and associated files deleted successfully',
    });

  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
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

// Add size limit for the API route
export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '100mb',
  },
}; 