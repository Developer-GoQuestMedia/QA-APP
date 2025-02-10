import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

interface VoiceAssignment {
  characterName: string;
  voiceId: string;
}

export async function POST(
  request: Request,
  { params }: { params: { episodeId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { assignments } = await request.json() as { assignments: VoiceAssignment[] };
    if (!assignments || !Array.isArray(assignments)) {
      return NextResponse.json(
        { error: 'Invalid assignments data' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    
    // Find the episode
    const episode = await db.collection('projects').findOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      { projection: { 'episodes.$': 1 } }
    );

    if (!episode || !episode.episodes?.[0]) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    // Create character voice mapping
    const characterVoices = assignments.map(assignment => ({
      characterName: assignment.characterName,
      voiceId: assignment.voiceId,
      assignedAt: new Date(),
    }));

    // Update episode with voice assignments
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step5.characterVoices': characterVoices,
          'episodes.$.steps.step5.status': 'completed',
          'episodes.$.steps.step5.updatedAt': new Date(),
          'episodes.$.step': 6,
        }
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Voice assignments saved successfully'
    });
  } catch (error: any) {
    console.error('Error saving voice assignments:', error);
    return NextResponse.json(
      { error: 'Failed to save voice assignments' },
      { status: 500 }
    );
  }
} 