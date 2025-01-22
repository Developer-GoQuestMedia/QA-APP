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
    if (targetEpisode.step !== 3) {
      return NextResponse.json(
        { error: 'Episode must complete step 2 first' },
        { status: 400 }
      );
    }

    // TODO: Add your step 3 processing logic here
    // For now, we'll just update the status to completed
    const result = await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.status': 'uploaded', // Reset status to uploaded for next process
          'episodes.$.step': 1, // Reset step to 1 for next process
        }
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Failed to update episode' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Step 3 completed successfully'
    });
  } catch (error) {
    console.error('Error in step 3:', error);
    return NextResponse.json(
      { error: 'Failed to process step 3' },
      { status: 500 }
    );
  }
} 