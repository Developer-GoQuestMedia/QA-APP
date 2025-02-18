import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { rateLimit } from '@/lib/rate-limit';
import { Redis } from '@upstash/redis';
import { z } from 'zod';

// Set runtime config
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Initialize Redis client (singleton)
const redis = new Redis({
  url: process.env.REDIS_URL || '',
  token: process.env.REDIS_TOKEN || '',
});

// Input validation schema
const requestSchema = z.object({
  voiceId: z.string().min(1),
  recordedAudioUrl: z.string().url(),
  dialogueNumber: z.string().min(1),
  characterName: z.string().min(1)
});

// Get R2 configuration
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;
const BUCKET_NAME = process.env.R2_BUCKET_NAME;

if (!BUCKET_NAME || !R2_PUBLIC_URL) {
  throw new Error('R2 storage configuration is missing');
}

// Initialize S3 client for R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_BUCKET_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY;

if (!ELEVEN_LABS_API_KEY) {
  throw new Error('ELEVEN_LABS_API_KEY is not configured');
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryOperation<T>(
  operation: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delay: number = RETRY_DELAY
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries <= 0) throw error;
    await sleep(delay);
    return retryOperation(operation, retries - 1, delay * 2);
  }
}

async function updateProgress(key: string, status: string, percent: number) {
  try {
    await redis.set(key, JSON.stringify({
      status,
      percent,
      timestamp: new Date().toISOString()
    }));

    // Expire progress after 1 hour
    await redis.expire(key, 60 * 60);
  } catch (error) {
    console.error('Failed to update progress:', error);
    // Non-critical error, continue processing
  }
}

export async function POST(request: NextRequest) {
  const progressKey = `progress:${request.ip || 'anonymous'}:${Date.now()}`;
  
  try {
    // Check rate limit
    const rateLimitResult = await rateLimit(request, {
      maxRequests: 50,
      windowMs: 60 * 1000 // 1 minute
    });

    if (rateLimitResult) {
      return rateLimitResult;
    }

    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate request body
    const body = await request.json();
    const validationResult = requestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid request data',
          details: validationResult.error.errors 
        },
        { status: 400 }
      );
    }

    const { voiceId, recordedAudioUrl, dialogueNumber, characterName } = validationResult.data;

    // Update progress key with session info
    const progressKey = `progress:${session.user.id}:${dialogueNumber}`;
    await updateProgress(progressKey, 'Started processing audio', 0);

    try {
      // Fetch the audio file with retry
      const audioResponse = await retryOperation(async () => {
        const response = await fetch(recordedAudioUrl, {
          headers: {
            'Accept': 'audio/wav,audio/*;q=0.9,*/*;q=0.8',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
        }

        return response;
      });

      await updateProgress(progressKey, 'Audio file fetched', 20);

      const audioBlob = await audioResponse.blob();
      
      if (audioBlob.size === 0) {
        throw new Error('Received empty audio file');
      }

      if (audioBlob.size > 10 * 1024 * 1024) { // 10MB limit
        throw new Error('Audio file too large. Maximum size is 10MB');
      }

      await updateProgress(progressKey, 'Preparing audio for processing', 40);

      const formData = new FormData();
      formData.append('audio', audioBlob, 'input.wav');
      formData.append('model_id', 'eleven_multilingual_sts_v2');
      formData.append('remove_background_noise', 'true');
      formData.append('output_format', 'pcm_44100');

      // Call ElevenLabs API with retry
      const response = await retryOperation(async () => {
        const response = await fetch(
          `https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': ELEVEN_LABS_API_KEY || '',
              'Accept': 'audio/wav',
            } as HeadersInit,
            body: formData,
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(JSON.stringify(errorData));
        }

        return response;
      });

      await updateProgress(progressKey, 'Voice conversion completed', 60);

      // Get audio data as Buffer
      const audioData = Buffer.from(await response.arrayBuffer());
      
      // Generate R2 path
      const sanitizedDialogueNumber = dialogueNumber.replace(/[^a-zA-Z0-9.-]/g, '_');
      const sanitizedCharacterName = characterName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const [projectNumber, episodeRaw] = dialogueNumber.split('.');
      const episodeNumber = episodeRaw.padStart(2, '0');
      const r2Key = `project_${projectNumber}/episode_${episodeNumber}/converted_audio/${sanitizedCharacterName}/${sanitizedDialogueNumber}.wav`;

      await updateProgress(progressKey, 'Uploading processed audio', 80);
      
      // Upload to R2 with retry
      await retryOperation(async () => {
        await s3Client.send(
          new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: r2Key,
            Body: audioData,
            ContentType: 'audio/wav',
            Metadata: {
              'character-name': characterName,
              'dialogue-number': dialogueNumber,
              'processed-by': session.user.email || 'unknown'
            }
          })
        );
      });

      await updateProgress(progressKey, 'Processing completed', 100);

      // Generate public URL
      const publicUrl = `https://${R2_PUBLIC_URL}/${r2Key}`;

      return NextResponse.json({
        success: true,
        audioUrl: publicUrl,
        dialogueNumber: dialogueNumber
      });

    } catch (processingError: any) {
      await updateProgress(progressKey, `Error: ${processingError.message}`, -1);
      throw processingError;
    }

  } catch (error: any) {
    console.error('Error in speech-to-speech conversion:', error);
    
    // Ensure progress is updated on error
    await updateProgress(progressKey, `Failed: ${error.message}`, -1);
    
    return NextResponse.json(
      { 
        error: 'Failed to process speech-to-speech conversion',
        details: error.message 
      },
      { status: error.status || 500 }
    );
  }
} 