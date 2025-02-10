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

    // Verify episode is in the correct step and has completed step 1
    if (targetEpisode.steps?.step1?.status !== 'completed') {
      return NextResponse.json(
        { error: 'Episode must complete step 1 first' },
        { status: 400 }
      );
    }

    // Update status to processing
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step2.status': 'processing',
          'episodes.$.step': 2,
        }
      }
    );

    // Call external API for scene data extraction
    const response = await axios.post(
      'https://scene-extractor-api.example.com/analyze',
      {
        videoPath: targetEpisode.videoPath,
        videoKey: targetEpisode.videoKey,
        episodeId: params.episodeId,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 1000 * 60 * 5, // 5 minutes timeout
      }
    );

    // Update episode with scene data
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step2.sceneData': response.data,
          'episodes.$.steps.step2.status': 'completed',
          'episodes.$.steps.step2.updatedAt': new Date(),
          'episodes.$.step': 3,
        }
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Scene data extraction started'
    });
  } catch (error: any) {
    console.error('Error in step 2:', error);
    
    // Update status to error
    const { db } = await connectToDatabase();
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step2.status': 'error',
          'episodes.$.steps.step2.error': error.message,
        }
      }
    );

    return NextResponse.json(
      { error: 'Failed to process step 2' },
      { status: 500 }
    );
  }
} 