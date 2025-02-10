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

    // Verify episode has completed step 6
    if (targetEpisode.steps?.step6?.status !== 'completed') {
      return NextResponse.json(
        { error: 'Episode must complete step 6 first' },
        { status: 400 }
      );
    }

    // Get voice conversions and original SFX
    const voiceConversions = targetEpisode.steps?.step6?.voiceConversions;
    const sfxAudio = targetEpisode.steps?.step1?.musicAndSoundEffectsPath;

    if (!voiceConversions || !Array.isArray(voiceConversions)) {
      return NextResponse.json(
        { error: 'Invalid voice conversion data from step 6' },
        { status: 400 }
      );
    }

    if (!sfxAudio) {
      return NextResponse.json(
        { error: 'Missing SFX audio from step 1' },
        { status: 400 }
      );
    }

    // Update status to processing
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step7.status': 'processing',
          'episodes.$.step': 7,
        }
      }
    );

    // Call external API for audio merging
    const response = await axios.post(
      'https://audio-merger-api.example.com/merge',
      {
        voiceConversions,
        sfxAudioPath: sfxAudio,
        sfxAudioKey: targetEpisode.steps?.step1?.musicAndSoundEffectsKey,
        episodeId: params.episodeId,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 1000 * 60 * 30, // 30 minutes timeout
      }
    );

    // Update episode with merged audio
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step7.mergedAudioPath': response.data.mergedAudioPath,
          'episodes.$.steps.step7.mergedAudioKey': response.data.mergedAudioKey,
          'episodes.$.steps.step7.status': 'completed',
          'episodes.$.steps.step7.updatedAt': new Date(),
          'episodes.$.step': 8,
        }
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Audio merging process started'
    });
  } catch (error: any) {
    console.error('Error in step 7:', error);
    
    // Update status to error
    const { db } = await connectToDatabase();
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step7.status': 'error',
          'episodes.$.steps.step7.error': error.message,
        }
      }
    );

    return NextResponse.json(
      { error: 'Failed to process step 7' },
      { status: 500 }
    );
  }
} 