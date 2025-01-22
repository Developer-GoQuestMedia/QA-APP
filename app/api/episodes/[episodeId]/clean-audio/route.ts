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

    // Call the audio cleaner endpoint
    const response = await fetch('https://audio-cleaner-676840814994.us-central1.run.app/audio-cleaner', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: targetEpisode.name,
        videoPath: targetEpisode.videoPath,
        videoKey: targetEpisode.videoKey,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Audio cleaner failed: ${error}`);
    }

    const cleanerResponse = await response.json();

    // Update the episode with the cleaner response data and step status
    const result = await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.cleanedSpeechPath': cleanerResponse.cleanedSpeechPath,
          'episodes.$.cleanedSpeechKey': cleanerResponse.cleanedSpeechKey,
          'episodes.$.musicAndSoundEffectsPath': cleanerResponse.musicAndSoundEffectsPath,
          'episodes.$.musicAndSoundEffectsKey': cleanerResponse.musicAndSoundEffectsKey,
          'episodes.$.status': 'processing',
          'episodes.$.step': 2, // Set to step 2 after successful audio cleaning
        }
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Failed to update episode' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: cleanerResponse
    });
  } catch (error) {
    console.error('Error cleaning audio:', error);
    return NextResponse.json(
      { error: 'Failed to clean audio' },
      { status: 500 }
    );
  }
} 