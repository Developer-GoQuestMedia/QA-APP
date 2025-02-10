import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectToDatabase } from '@/lib/mongodb';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    
    const voiceModels = await db.collection('elevenLabVoiceModel')
      .find({})
      .project({
        voice_id: 1,
        name: 1,
        preview_url: 1,
        labels: 1,
      })
      .toArray();

    return NextResponse.json(voiceModels);
  } catch (error: any) {
    console.error('Error fetching voice models:', error);
    return NextResponse.json(
      { error: 'Failed to fetch voice models' },
      { status: 500 }
    );
  }
} 