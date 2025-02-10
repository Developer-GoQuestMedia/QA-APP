import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import axios from 'axios';

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

    // Verify episode has completed step 7
    if (targetEpisode.steps?.step7?.status !== 'completed') {
      return NextResponse.json(
        { error: 'Episode must complete step 7 first' },
        { status: 400 }
      );
    }

    // Get merged audio and original video
    const mergedAudioPath = targetEpisode.steps?.step7?.mergedAudioPath;
    const mergedAudioKey = targetEpisode.steps?.step7?.mergedAudioKey;

    if (!mergedAudioPath || !mergedAudioKey) {
      return NextResponse.json(
        { error: 'Missing merged audio from step 7' },
        { status: 400 }
      );
    }

    // Update status to processing
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step8.status': 'processing',
          'episodes.$.step': 8,
        }
      }
    );

    // Call external API for final video merge
    const response = await axios.post(
      'https://video-merger-api.example.com/merge',
      {
        videoPath: targetEpisode.videoPath,
        videoKey: targetEpisode.videoKey,
        mergedAudioPath,
        mergedAudioKey,
        episodeId: params.episodeId,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 1000 * 60 * 60, // 60 minutes timeout
      }
    );

    // Update episode with final video
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step8.finalVideoPath': response.data.finalVideoPath,
          'episodes.$.steps.step8.finalVideoKey': response.data.finalVideoKey,
          'episodes.$.steps.step8.status': 'completed',
          'episodes.$.steps.step8.updatedAt': new Date(),
          'episodes.$.status': 'completed',
          'episodes.$.step': 8,
        }
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Final video merge process started'
    });
  } catch (error: any) {
    console.error('Error in step 8:', error);
    
    // Update status to error
    const { db } = await connectToDatabase();
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step8.status': 'error',
          'episodes.$.steps.step8.error': error.message,
        }
      }
    );

    return NextResponse.json(
      { error: 'Failed to process step 8' },
      { status: 500 }
    );
  }
} 