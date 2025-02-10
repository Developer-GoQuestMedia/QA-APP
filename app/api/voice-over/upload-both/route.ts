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

function padNumber(num: string | number): string {
  return num.toString().padStart(2, '0');
}

function getBasePathFromVideoKey(videoKey: string): string {
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
    const originalAudio = formData.get('originalAudio') as File;
    const processedAudio = formData.get('processedAudio') as File;
    const dialogueId = formData.get('dialogueId') as string;
    const projectId = formData.get('projectId') as string;
    const sceneNumber = formData.get('sceneNumber') as string;

    // 3. Validate required fields
    if (!originalAudio || !processedAudio || !dialogueId || !projectId || !sceneNumber) {
      return NextResponse.json({ 
        error: 'Missing required fields',
        details: { originalAudio: !!originalAudio, processedAudio: !!processedAudio, dialogueId, projectId, sceneNumber }
      }, { status: 400 });
    }

    // 4. Parse dialogue number
    const dialogueComponents = parseDialogueNumber(dialogueId);

    // 5. Connect to master database
    const { db: masterDb, client } = await connectToDatabase();
    
    // 6. Get project details
    const projectDoc = await masterDb.collection('projects').findOne(
      { _id: new ObjectId(projectId) }
    );

    if (!projectDoc) {
      throw new Error('Project not found in master database');
    }

    // 7. Connect to project's database
    const projectDb = client.db(projectDoc.databaseName);
    
    // 8. Find episode collection
    const paddedEpisodeNumber = padNumber(dialogueComponents.episodeNumber);
    const episode = projectDoc.episodes.find((ep: any) => {
      const match = ep.collectionName.match(/_Ep_(\d+)$/);
      return match && match[1] === paddedEpisodeNumber;
    });

    if (!episode) {
      throw new Error(`Episode ${paddedEpisodeNumber} not found in project`);
    }

    // 9. Generate file paths
    const basePath = getBasePathFromVideoKey(episode.videoKey);
    const originalKey = `${basePath}/recordings/${dialogueId}.wav`;
    const processedKey = `${basePath}/processed_recordings/${dialogueId}.wav`;

    // 10. Upload both files to R2
    await Promise.all([
      s3Client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: originalKey,
        Body: Buffer.from(await originalAudio.arrayBuffer()),
        ContentType: 'audio/wav',
      })),
      s3Client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: processedKey,
        Body: Buffer.from(await processedAudio.arrayBuffer()),
        ContentType: 'audio/wav',
      }))
    ]);

    // 11. Generate public URLs
    const originalUrl = `https://${process.env.R2_PUBLIC_URL}/${originalKey}`;
    const processedUrl = `https://${process.env.R2_PUBLIC_URL}/${processedKey}`;

    // 12. Update dialogue in database with both URLs
    const updateResult = await projectDb.collection(episode.collectionName).updateOne(
      { 
        'dialogues.dialogNumber': dialogueId
      },
      {
        $set: {
          'dialogues.$.voiceOverUrl': processedUrl,          // Main URL (processed)
          'dialogues.$.originalVoiceOverUrl': originalUrl,    // Original recording
          'dialogues.$.processedVoiceOverUrl': processedUrl,  // Processed recording
          'dialogues.$.status': 'voice-over-added',
          'dialogues.$.updatedAt': new Date(),
          'dialogues.$.updatedBy': session.user.id
        }
      }
    );

    if (updateResult.matchedCount === 0) {
      throw new Error(`Dialogue ${dialogueId} not found in episode collection ${episode.collectionName}`);
    }

    // 13. Return success response with all URLs
    return NextResponse.json({ 
      success: true,
      originalUrl,
      processedUrl,
      voiceOverUrl: processedUrl,          // Main URL
      originalVoiceOverUrl: originalUrl,    // Original recording URL
      processedVoiceOverUrl: processedUrl,  // Processed recording URL
      dialogueId,
      sceneNumber,
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