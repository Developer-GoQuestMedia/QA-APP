import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Set runtime config
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Get R2 configuration
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;
const BUCKET_NAME = process.env.R2_BUCKET_NAME;

if (!BUCKET_NAME) {
  console.error('R2_BUCKET_NAME is not configured in environment variables');
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

export async function POST(request: Request) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify API key exists
    if (!ELEVEN_LABS_API_KEY) {
      console.error('ElevenLabs API key is not configured');
      return NextResponse.json(
        { error: 'ElevenLabs API is not properly configured' },
        { status: 500 }
      );
    }

    // Verify R2 configuration
    if (!BUCKET_NAME || !R2_PUBLIC_URL) {
      console.error('R2 storage is not properly configured');
      return NextResponse.json(
        { error: 'R2 storage is not properly configured' },
        { status: 500 }
      );
    }

    // Get request body
    const { voiceId, recordedAudioUrl, dialogueNumber, characterName } = await request.json();

    if (!voiceId || !recordedAudioUrl || !dialogueNumber || !characterName) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    try {
      // Fetch the audio file with proper headers for R2
      const audioResponse = await fetch(recordedAudioUrl, {
        headers: {
          'Accept': 'audio/wav,audio/*;q=0.9,*/*;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        cache: 'no-store'
      });

      if (!audioResponse.ok) {
        throw new Error(`Failed to fetch audio: ${audioResponse.status} ${audioResponse.statusText}`);
      }

      const audioBlob = await audioResponse.blob();
      
      // Verify we got audio data
      if (audioBlob.size === 0) {
        throw new Error('Received empty audio file');
      }

      const formData = new FormData();
      formData.append('audio', audioBlob, 'input.wav');
      formData.append('model_id', 'eleven_multilingual_sts_v2');
      formData.append('remove_background_noise', 'true');
      formData.append('output_format', 'pcm_44100');

      // Call ElevenLabs API with explicit headers
      const response = await fetch(
        `https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': ELEVEN_LABS_API_KEY,
            'Accept': 'audio/wav',
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('ElevenLabs API Error:', errorData);
        throw new Error(JSON.stringify(errorData));
      }

      // Get audio data as Buffer
      const audioData = Buffer.from(await response.arrayBuffer());
      
      // Generate R2 path with project/episode/converted_audio/character structure
      const sanitizedDialogueNumber = dialogueNumber.replace(/[^a-zA-Z0-9.-]/g, '_');
      const sanitizedCharacterName = characterName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const dialogueComponents = dialogueNumber.split('.');
      const projectNumber = dialogueComponents[0];
      const episodeNumber = dialogueComponents[1].padStart(2, '0');
      const r2Key = `project_${projectNumber}/episode_${episodeNumber}/converted_audio/${sanitizedCharacterName}/${sanitizedDialogueNumber}.wav`;
      
      console.log('Uploading to R2:', {
        bucket: BUCKET_NAME,
        key: r2Key,
        characterName: characterName,
        projectNumber,
        episodeNumber,
        contentType: 'audio/wav',
        dataSize: audioData.length
      });

      // Upload to R2
      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: r2Key,
          Body: audioData,
          ContentType: 'audio/wav',
        })
      );

      // Generate public URL
      const publicUrl = `https://${R2_PUBLIC_URL}/${r2Key}`;

      return NextResponse.json({
        success: true,
        audioUrl: publicUrl,
        dialogueNumber: dialogueNumber
      });

    } catch (fetchError: any) {
      console.error('Error processing audio:', fetchError);
      return NextResponse.json(
        { 
          error: 'Failed to process audio',
          details: fetchError.message 
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Error in speech-to-speech conversion:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process speech-to-speech conversion',
        details: error.message 
      },
      { status: 500 }
    );
  }
} 