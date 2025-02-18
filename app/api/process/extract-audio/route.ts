import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getR2Client } from '@/lib/r2';
import { HeadObjectCommand, HeadObjectCommandOutput } from '@aws-sdk/client-s3';

// Get bucket name from environment variable
const BUCKET_NAME = process.env.R2_BUCKET_NAME;

export async function POST(req: Request) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { projectId, episodeId, videoPath, videoKey, episodeName } = body;

    // Validate required fields
    if (!projectId || !episodeId || !videoPath || !videoKey || !episodeName) {
      return NextResponse.json(
        { error: 'Missing required fields', 
          required: { projectId, episodeId, videoPath, videoKey, episodeName } 
        }, 
        { status: 400 }
      );
    }

    if (!BUCKET_NAME) {
      throw new Error('R2_BUCKET_NAME environment variable is not set');
    }

    // Connect to MongoDB
    const { db } = await connectToDatabase();

    // Verify project and episode exist
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(projectId)
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const episode = await db.collection('episodes').findOne({
      _id: new ObjectId(episodeId)
    });

    if (!episode) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    // Get the folder path from videoKey
    const folderPath = videoKey.split('/').slice(0, -1).join('/');

    // Define output paths in the same directory as the video
    const speechOutputKey = `${folderPath}/${episodeName}_extracted_speech.wav`;
    const musicOutputKey = `${folderPath}/${episodeName}_extracted_music.wav`;

    // Initialize R2 client
    const r2Client = await getR2Client();
    if (!r2Client) {
      throw new Error('Failed to initialize R2 client');
    }

    // Check if files already exist
    try {
      const existingFiles = await Promise.all([
        r2Client.send(new HeadObjectCommand({ 
          Bucket: BUCKET_NAME,
          Key: speechOutputKey 
        })).catch(() => null),
        r2Client.send(new HeadObjectCommand({ 
          Bucket: BUCKET_NAME,
          Key: musicOutputKey 
        })).catch(() => null)
      ]);

      const existingFilesFound = existingFiles.some(
        (result): result is HeadObjectCommandOutput => result !== null
      );
      
      if (existingFilesFound) {
        return NextResponse.json({
          error: 'Extracted files already exist',
          speechOutputKey,
          musicOutputKey
        }, { status: 409 });
      }
    } catch (error) {
      // Ignore errors here as they likely mean files don't exist
      console.debug('Error checking existing files:', error);
    }

    // Update episode status to processing
    await db.collection('episodes').updateOne(
      { _id: new ObjectId(episodeId) },
      { 
        $set: {
          'steps.audioExtraction.status': 'processing',
          'steps.audioExtraction.startedAt': new Date(),
          'steps.audioExtraction.progress': 0,
          'steps.audioExtraction.extracted_speechKey': speechOutputKey,
          'steps.audioExtraction.extracted_musicKey': musicOutputKey,
          status: 'processing'
        }
      }
    );

    // Log the extraction request
    console.log('Starting audio extraction:', {
      episodeId,
      videoKey,
      speechOutputKey,
      musicOutputKey,
      folderPath
    });

    // TODO: Implement the actual audio extraction process
    // This should be done in a background worker/queue
    // For now, we'll just simulate the process

    return NextResponse.json({
      success: true,
      message: 'Audio extraction process initiated',
      data: {
        episodeId,
        status: 'processing',
        speechOutputKey,
        musicOutputKey,
        folderPath
      }
    });

  } catch (error) {
    console.error('Error in audio extraction:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 