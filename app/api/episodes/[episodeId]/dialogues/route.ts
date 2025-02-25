import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/auth.config';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { Episode } from '@/types/project';

export async function GET(
  request: NextRequest,
  { params }: { params: { episodeId: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allow both admin and voice-over users
    if (!['admin', 'voiceOver'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Validate episodeId
    const { episodeId } = params;
    if (!episodeId || !ObjectId.isValid(episodeId)) {
      return NextResponse.json(
        { error: 'Invalid episode ID format' },
        { status: 400 }
      );
    }

    // Connect to database
    const { db } = await connectToDatabase();

    // Find the episode
    const project = await db.collection('projects').findOne(
      { 'episodes._id': new ObjectId(episodeId) },
      { projection: { 'episodes.$': 1 } }
    );

    if (!project || !project.episodes?.[0]) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    const episode = project.episodes[0] as Episode;

    // Get dialogues from the episode
    const dialogues = episode.dialogues || [];

    // Sort dialogues by index if available
    const sortedDialogues = [...dialogues].sort((a, b) => 
      (a.index || 0) - (b.index || 0)
    ).map(dialogue => ({
      _id: new ObjectId().toString(), // Generate new ID for each dialogue
      dialogNumber: dialogue.dialogNumber,
      dialogue: dialogue.dialogue,
      characterName: dialogue.characterName,
      status: dialogue.status,
      timeStart: dialogue.timeStart,
      timeEnd: dialogue.timeEnd,
      subtitleIndex: dialogue.subtitleIndex,
      videoClipUrl: dialogue.videoClipUrl,
      recordedAudioUrl: dialogue.recordedAudioUrl,
      voiceOverNotes: dialogue.voiceOverNotes,
      voiceId: dialogue.voiceId,
      ai_converted_voiceover_url: dialogue.voiceOverUrl,
      index: dialogue.index,
      revisionRequested: dialogue.revisionRequested || false,
      needsReRecord: dialogue.needsReRecord || false
    }));

    return NextResponse.json(sortedDialogues);
  } catch (error) {
    console.error('Error fetching dialogues:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 