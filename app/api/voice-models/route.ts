import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import axios from 'axios';

// Set runtime config
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Call ElevenLabs API to get voices
    const response = await axios.get(
      'https://api.elevenlabs.io/v1/voices',
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY
        }
      }
    );

    // Transform voice data to match our interface
    const voices = response.data.voices.map((voice: any) => ({
      id: voice.voice_id,
      name: voice.name,
      category: voice.category || 'custom',
      fineTuning: {
        isAllowed: voice.fine_tuning?.is_allowed || false,
        language: voice.fine_tuning?.language || 'en'
      },
      labels: {
        accent: voice.labels?.accent || null,
        description: voice.labels?.description || null,
        age: voice.labels?.age || null,
        gender: voice.labels?.gender || null,
        useCase: voice.labels?.use_case || null
      },
      description: voice.description || '',
      previewUrl: voice.preview_url || '',
      supportedModels: voice.available_for_tiers || [],
      verification: {
        required: voice.verification?.required || false,
        verified: voice.verification?.verified || false
      }
    }));

    return NextResponse.json(voices);

  } catch (error) {
    console.error('Error fetching voice models:', error);
    return NextResponse.json(
      { error: 'Failed to fetch voice models' },
      { status: 500 }
    );
  }
} 