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
    console.log('Clean audio request received:', {
      episodeId: params.episodeId,
      params
    });

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!params.episodeId) {
      console.error('Episode ID missing in params');
      return NextResponse.json({ error: 'Episode ID is required' }, { status: 400 });
    }

    // Validate ObjectId format
    // if (!ObjectId.isValid(params.episodeId)) {
    //   console.error('Invalid ObjectId format:', params.episodeId);
    //   return NextResponse.json({ error: 'Invalid episode ID format' }, { status: 400 });
    // }

    const { db } = await connectToDatabase();
    
    // Find the episode
    const episodeObjectId = new ObjectId(params.episodeId);
    console.log('Searching for episode with ID:', episodeObjectId.toString());

    const episode = await db.collection('projects').findOne(
      { 'episodes._id': episodeObjectId },
      { projection: { 'episodes.$': 1 } }
    );

    console.log('Database query result:', {
      found: !!episode,
      hasEpisodes: !!episode?.episodes?.length
    });

    if (!episode || !episode.episodes?.[0]) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    const targetEpisode = episode.episodes[0];
    console.log('Found target episode:', {
      name: targetEpisode.name,
      status: targetEpisode.status,
      step: targetEpisode.step
    });

    // Get request body
    const requestBody = await request.json();
    console.log('Request body:', {
      ...requestBody,
      videoPath: requestBody.videoPath ? '[REDACTED]' : undefined
    });
    
    if (!requestBody.name || !requestBody.videoPath || !requestBody.videoKey) {
      return NextResponse.json(
        { error: 'Missing required fields: name, videoPath, or videoKey' },
        { status: 400 }
      );
    }

    // Call the audio cleaner endpoint
    console.log('Calling audio cleaner endpoint...');
    const response = await fetch('https://audio-cleaner-676840814994.us-central1.run.app/audio-cleaner', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: requestBody.name,
        videoPath: requestBody.videoPath,
        videoKey: requestBody.videoKey,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Audio cleaner endpoint error:', {
        status: response.status,
        error
      });
      throw new Error(`Audio cleaner failed: ${error}`);
    }

    const cleanerResponse = await response.json();
    console.log('Audio cleaner response received');

    // Update the episode with the cleaner response data and step status
    console.log('Updating episode with cleaner response...');
    const result = await db.collection('projects').updateOne(
      { 'episodes._id': episodeObjectId },
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

    console.log('Update result:', {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Failed to update episode' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: cleanerResponse
    });
  } catch (error: any) {
    console.error('Error cleaning audio:', {
      message: error.message,
      stack: error.stack
    });
    return NextResponse.json(
      { error: error.message || 'Failed to clean audio' },
      { status: 500 }
    );
  }
} 