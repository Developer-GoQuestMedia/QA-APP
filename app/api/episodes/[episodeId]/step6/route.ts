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

    // Verify episode has completed step 5
    if (targetEpisode.steps?.step5?.status !== 'completed') {
      return NextResponse.json(
        { error: 'Episode must complete step 5 first' },
        { status: 400 }
      );
    }

    // Get translation data and voice assignments
    const translationData = targetEpisode.steps?.step4?.translationData;
    const characterVoices = targetEpisode.steps?.step5?.characterVoices;

    if (!translationData?.dialogues || !Array.isArray(translationData.dialogues)) {
      return NextResponse.json(
        { error: 'Invalid translation data from step 4' },
        { status: 400 }
      );
    }

    if (!characterVoices || !Array.isArray(characterVoices)) {
      return NextResponse.json(
        { error: 'Invalid voice assignments from step 5' },
        { status: 400 }
      );
    }

    // Update status to processing
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step6.status': 'processing',
          'episodes.$.step': 6,
          'episodes.$.steps.step6.voiceConversions': translationData.dialogues.map((d: { id: string }) => ({
            dialogueId: d.id,
            status: 'pending'
          }))
        }
      }
    );

    // Call external API for voice conversion
    const response = await axios.post(
      'https://voice-conversion-api.example.com/convert',
      {
        dialogues: translationData.dialogues,
        characterVoices,
        episodeId: params.episodeId,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.ELEVENLABS_API_KEY
        },
        timeout: 1000 * 60 * 60, // 60 minutes timeout
      }
    );

    // Update episode with voice conversion results
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step6.voiceConversions': response.data.conversions,
          'episodes.$.steps.step6.status': 'completed',
          'episodes.$.steps.step6.updatedAt': new Date(),
          'episodes.$.step': 7,
        }
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Voice conversion process started'
    });
  } catch (error: any) {
    console.error('Error in step 6:', error);
    
    // Update status to error
    const { db } = await connectToDatabase();
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step6.status': 'error',
          'episodes.$.steps.step6.error': error.message,
        }
      }
    );

    return NextResponse.json(
      { error: 'Failed to process step 6' },
      { status: 500 }
    );
  }
} 