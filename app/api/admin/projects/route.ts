import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
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
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get form data
    const formData = await request.formData();
    
    // Extract project data
    const projectData = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      sourceLanguage: formData.get('sourceLanguage') as string,
      targetLanguage: formData.get('targetLanguage') as string,
      dialogue_collection: formData.get('dialogue_collection') as string,
      status: formData.get('status') as string || 'pending',
      videoPath: formData.get('videoPath') as string,
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
    let videoKey = '';

    if (videoFile) {
      try {
        // Generate folder path based on collection name
        const folderPath = `${projectData.dialogue_collection}/videos/`;
        
        // Generate a unique filename
        const fileExtension = videoFile.name.split('.').pop();
        const uniqueFilename = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
        const key = `${folderPath}${uniqueFilename}`;
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

    // Create a new collection for dialogues
    const dialogue_collection = projectData.dialogue_collection;
    try {
      await db.createCollection(dialogue_collection);
      console.log(`Created new collection: ${dialogue_collection}`);
    } catch (error: any) {
      // If collection already exists, continue
      if (error.code !== 48) { // 48 is MongoDB's error code for "collection already exists"
        throw error;
      }
    }

    // Create project with video path
    const result = await db.collection('projects').insertOne({
      ...projectData,
      videoPath,
      videoKey, // Store the key for future reference
      createdAt: new Date(),
      updatedAt: new Date(),
      assignedTo: [],
      folderPath: `${projectData.dialogue_collection}/videos/`,
    });

    return NextResponse.json({
      success: true,
      data: {
        _id: result.insertedId,
        ...projectData,
        videoPath,
        videoKey,
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