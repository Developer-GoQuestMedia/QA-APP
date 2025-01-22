import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function POST(
  request: Request,
  { params }: { params: { episodeId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    const targetEpisode = episode.episodes[0];

    // Verify episode is in the correct step
    if (targetEpisode.step !== 2) {
      return NextResponse.json(
        { error: 'Episode must complete step 1 first' },
        { status: 400 }
      );
    }

    // TODO: Add your step 2 processing logic here
    // For now, we'll just update the step status
    const result = await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.status': 'processing',
          'episodes.$.step': 3, // Move to step 3
        }
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Failed to update episode' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Step 2 completed successfully'
    });
  } catch (error) {
    console.error('Error in step 2:', error);
    return NextResponse.json(
      { error: 'Failed to process step 2' },
      { status: 500 }
    );
  }
} 