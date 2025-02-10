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

    // Verify episode has completed step 4
    if (targetEpisode.steps?.step4?.status !== 'completed') {
      return NextResponse.json(
        { error: 'Episode must complete step 4 first' },
        { status: 400 }
      );
    }

    // Get translation data from step 4
    const translationData = targetEpisode.steps?.step4?.translationData;
    if (!translationData || !translationData.dialogues || !Array.isArray(translationData.dialogues)) {
      return NextResponse.json(
        { error: 'Invalid translation data from step 4' },
        { status: 400 }
      );
    }

    // Update status to processing
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step5.status': 'processing',
          'episodes.$.step': 5,
        }
      }
    );

    // Extract unique characters from dialogues
    const characters = Array.from(new Set(translationData.dialogues.map((d: { characterName: string }) => d.characterName)));

    // Call external API for voice assignment
    const response = await axios.post(
      'https://voice-assignment-api.example.com/assign',
      {
        characters,
        episodeId: params.episodeId,
        targetLanguage: targetEpisode.targetLanguage,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 1000 * 60 * 5, // 5 minutes timeout
      }
    );

    // Update episode with voice assignments
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step5.characterVoices': response.data.voiceAssignments,
          'episodes.$.steps.step5.status': 'completed',
          'episodes.$.steps.step5.updatedAt': new Date(),
          'episodes.$.step': 6,
        }
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Voice assignment completed'
    });
  } catch (error: any) {
    console.error('Error in step 5:', error);
    
    // Update status to error
    const { db } = await connectToDatabase();
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.step5.status': 'error',
          'episodes.$.steps.step5.error': error.message,
        }
      }
    );

    return NextResponse.json(
      { error: 'Failed to process step 5' },
      { status: 500 }
    );
  }
} 