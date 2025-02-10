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

    // Verify episode has completed step 3
    if (targetEpisode.steps?.step3?.status !== 'completed') {
      return NextResponse.json(
        { error: 'Episode must complete step 3 first' },
        { status: 400 }
      );
    }

    // Get video clips data from step 3
    const videoClips = targetEpisode.steps?.step3?.videoClips;
    if (!videoClips || !Array.isArray(videoClips)) {
      return NextResponse.json(
        { error: 'Invalid video clips data from step 3' },
        { status: 400 }
      );
    }

    // Update status to processing
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step4.status': 'processing',
          'episodes.$.step': 4,
        }
      }
    );

    // Call external API for translation
    const response = await axios.post(
      'https://translation-api.example.com/translate',
      {
        videoClips,
        episodeId: params.episodeId,
        sourceLanguage: targetEpisode.sourceLanguage,
        targetLanguage: targetEpisode.targetLanguage,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 1000 * 60 * 30, // 30 minutes timeout
      }
    );

    // Update episode with translation data
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step4.translationData': response.data,
          'episodes.$.steps.step4.status': 'completed',
          'episodes.$.steps.step4.updatedAt': new Date(),
          'episodes.$.step': 5,
        }
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Translation process started'
    });
  } catch (error: any) {
    console.error('Error in step 4:', error);
    
    // Update status to error
    const { db } = await connectToDatabase();
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step4.status': 'error',
          'episodes.$.steps.step4.error': error.message,
        }
      }
    );

    return NextResponse.json(
      { error: 'Failed to process step 4' },
      { status: 500 }
    );
  }
} 