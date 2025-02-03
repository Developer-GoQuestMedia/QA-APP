import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/auth.config';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

// Configure request size limit and parsing
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Initialize R2 client
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_BUCKET_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

// Helper function to parse dialogue number
function parseDialogueNumber(dialogueNumber: string) {
  const parts = dialogueNumber.split('.');
  if (parts.length !== 4) {
    throw new Error('Invalid dialogue number format. Expected format: projectNumber.episodeNumber.sceneNumber.dialogueNumber');
  }
  return {
    projectNumber: parts[0],
    episodeNumber: parts[1],
    sceneNumber: parts[2],
    dialogueNumber: parts[3]
  };
}

// Helper function to pad number with zeros
function padNumber(num: string | number): string {
  return num.toString().padStart(2, '0');
}

// Helper function to get base path from video key
function getBasePathFromVideoKey(videoKey: string): string {
  // Remove the video filename from the path
  return videoKey.split('/').slice(0, -1).join('/');
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authorization check
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse form data
    const formData = await request.formData();
    const audio = formData.get('audio') as File;
    const dialogueId = formData.get('dialogueId') as string;
    const sceneNumber = formData.get('sceneNumber') as string;
    const dialogueIndex = formData.get('dialogueIndex') as string;
    const projectId = formData.get('projectId') as string;

    // 3. Validate required fields
    if (!audio || !dialogueId || !sceneNumber || !dialogueIndex || !projectId) {
      return NextResponse.json({ 
        error: 'Missing required fields', 
        details: { audio: !!audio, dialogueId, sceneNumber, dialogueIndex, projectId }
      }, { status: 400 });
    }

    // 4. Parse dialogue number to get components
    const dialogueComponents = parseDialogueNumber(dialogueId);

    // 5. Connect to master database first to get project details
    const { db: masterDb, client } = await connectToDatabase();
    
    // Find project document to get database and collection names
    const projectDoc = await masterDb.collection('projects').findOne(
      { _id: new ObjectId(projectId) }
    );

    if (!projectDoc) {
      throw new Error('Project not found in master database');
    }

    // 6. Connect to project's database
    const projectDb = client.db(projectDoc.databaseName);
    
    // Find episode collection name from project document's episodes array
    // Format episode number to match collection name pattern (e.g., "01" for Ep_01)
    const paddedEpisodeNumber = padNumber(dialogueComponents.episodeNumber);
    const episode = projectDoc.episodes.find((ep: any) => {
      // Extract episode number from collection name (e.g., "Aggeliki_Ep_01" -> "01")
      const match = ep.collectionName.match(/_Ep_(\d+)$/);
      return match && match[1] === paddedEpisodeNumber;
    });

    if (!episode) {
      throw new Error(`Episode ${paddedEpisodeNumber} not found in project document. Available episodes: ${projectDoc.episodes.map((ep: any) => ep.collectionName).join(', ')}`);
    }

    // 7. Generate file path for R2 using the same structure as video
    const basePath = getBasePathFromVideoKey(episode.videoKey);
    const fileName = `${dialogueId}.wav`;
    const key = `${basePath}/recordings/${fileName}`;

    // 8. Convert audio to buffer
    const arrayBuffer = await audio.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 9. Upload to R2
    const putObjectCommand = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: buffer,
      ContentType: 'audio/wav',
    });

    await s3Client.send(putObjectCommand);

    // 10. Generate public URL
    const publicUrl = `https://${process.env.R2_PUBLIC_URL}/${key}`;

    // 11. Update dialogue in project database
    const updateResult = await projectDb.collection(episode.collectionName).updateOne(
      { 
        'dialogues.dialogNumber': dialogueId
      },
      {
        $set: {
          'dialogues.$.voiceOverUrl': publicUrl,
          'dialogues.$.recordedAudioUrl': publicUrl,
          'dialogues.$.status': 'voice-over-added',
          'dialogues.$.updatedAt': new Date(),
          'dialogues.$.updatedBy': session.user.id
        }
      }
    );

    if (updateResult.matchedCount === 0) {
      throw new Error(`Dialogue ${dialogueId} not found in episode collection ${episode.collectionName}`);
    }

    // 12. Return success response
    return NextResponse.json({ 
      success: true,
      url: publicUrl,
      key: key,
      dialogueId: dialogueId,
      sceneNumber: sceneNumber,
      databaseName: projectDoc.databaseName,
      collectionName: episode.collectionName
    });

  } catch (error: any) {
    console.error('Error uploading voice-over:', error);
    return NextResponse.json({ 
      error: 'Failed to upload voice-over',
      details: error.message,
      stack: error.stack
    }, { status: 500 });
  }
} 