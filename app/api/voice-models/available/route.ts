import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectToDatabase } from '@/lib/mongodb';

// Set runtime config
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const REQUIRED_MODEL = 'eleven_multilingual_sts_v2';

interface VoiceModel {
  voice_id: string;
  name: string;
  category: string;
  fine_tuning: {
    is_allowed_to_fine_tune: boolean;
    language?: string;
  };
  labels: {
    accent?: string;
    description?: string;
    age?: string;
    gender?: string;
    use_case?: string;
  };
  description: string | null;
  preview_url: string;
  high_quality_base_model_ids: string[];
  voice_verification: {
    requires_verification: boolean;
    is_verified: boolean;
  };
}

export async function GET(request: Request) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Connect to database
    const { db } = await connectToDatabase();
    
    // Fetch voice models with relevant fields and filter for supported model
    const voiceModels = await db.collection('elevenLabVoiceModel')
      .find({
        high_quality_base_model_ids: REQUIRED_MODEL // Filter for models that support our required model
      })
      .project({
        voice_id: 1,
        name: 1,
        category: 1,
        fine_tuning: {
          is_allowed_to_fine_tune: 1,
          language: 1
        },
        labels: 1,
        description: 1,
        preview_url: 1,
        high_quality_base_model_ids: 1,
        voice_verification: {
          requires_verification: 1,
          is_verified: 1
        },
        _id: 0
      })
      .toArray() as VoiceModel[];

    // Format the response
    const formattedModels = voiceModels.map(model => ({
      id: model.voice_id,
      name: model.name,
      category: model.category || 'general',
      fineTuning: {
        isAllowed: model.fine_tuning?.is_allowed_to_fine_tune || false,
        language: model.fine_tuning?.language || 'en'
      },
      labels: {
        accent: model.labels?.accent || null,
        description: model.labels?.description || null,
        age: model.labels?.age || null,
        gender: model.labels?.gender || null,
        useCase: model.labels?.use_case || null
      },
      description: model.description || '',
      previewUrl: model.preview_url,
      supportedModels: model.high_quality_base_model_ids || [],
      verification: {
        required: model.voice_verification?.requires_verification || false,
        verified: model.voice_verification?.is_verified || false
      }
    }));

    return NextResponse.json({
      success: true,
      models: formattedModels,
      total: formattedModels.length
    });

  } catch (error: any) {
    console.error('Error fetching available voice models:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch voice models',
        details: error.message 
      },
      { status: 500 }
    );
  }
} 