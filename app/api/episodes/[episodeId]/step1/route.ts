import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

interface Step1Input {
  name: string;
  videoPath: string;
  videoKey: string;
  episodeId: string;
  step: number;
}

export async function POST(
  request: Request,
  { params }: { params: { episodeId: string } }
) {
  try {
    // 1. Verify session
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request body
    const body = await request.json() as Step1Input;
    if (!body.videoPath || !body.videoKey || !body.episodeId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 3. Connect to database
    const { db } = await connectToDatabase();
    
    // 4. Find the episode
    const episode = await db.collection('projects').findOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      { projection: { 'episodes.$': 1 } }
    );

    if (!episode || !episode.episodes?.[0]) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    const targetEpisode = episode.episodes[0];

    // 5. Update episode with processing status
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step1': {
            status: 'processing',
            inputParameters: {
              name: body.name,
              videoPath: body.videoPath,
              videoKey: body.videoKey,
              episodeId: body.episodeId
            },
            startedAt: new Date()
          },
          'episodes.$.step': 1
        }
      }
    );

    // 6. Return success response
    return NextResponse.json({
      success: true,
      message: 'Step 1 process started',
      episode: targetEpisode
    });

  } catch (error: any) {
    console.error('Error in step 1:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process step 1',
        details: error.message 
      },
      { status: 500 }
    );
  }
} 