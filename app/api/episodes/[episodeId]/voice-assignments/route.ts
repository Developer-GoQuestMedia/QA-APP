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
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    const { characterName, voiceId, dialogueIds } = body;

    // Validate input
    if (!characterName || !voiceId || !dialogueIds?.length) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Connect to database
    const { db } = await connectToDatabase();
    
    // Find the episode
    const episode = await db.collection('projects').findOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      { projection: { 'episodes.$': 1 } }
    );

    if (!episode || !episode.episodes?.[0]) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    // Update voice assignments for all dialogues
    const updatePromises = dialogueIds.map((dialogueId: string) =>
      db.collection('projects').updateOne(
        {
          'episodes._id': new ObjectId(params.episodeId),
          'episodes.dialogues._id': dialogueId
        },
        {
          $set: {
            'episodes.$.dialogues.$[dialogue].voiceId': voiceId,
            'episodes.$.dialogues.$[dialogue].updatedAt': new Date(),
            'episodes.$.dialogues.$[dialogue].updatedBy': session.user.email
          }
        },
        {
          arrayFilters: [{ 'dialogue._id': dialogueId }]
        }
      )
    );

    await Promise.all(updatePromises);

    // Update episode status
    await db.collection('projects').updateOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      {
        $set: {
          'episodes.$.steps.voiceAssignment.status': 'completed',
          'episodes.$.steps.voiceAssignment.updatedAt': new Date()
        }
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Voice assignments updated successfully'
    });

  } catch (error) {
    console.error('Error in voice assignment:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: { episodeId: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Connect to database
    const { db } = await connectToDatabase();
    
    // Find the episode
    const episode = await db.collection('projects').findOne(
      { 'episodes._id': new ObjectId(params.episodeId) },
      { projection: { 'episodes.$': 1 } }
    );

    if (!episode || !episode.episodes?.[0]) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    // Get voice assignments
    const voiceAssignments = episode.episodes[0].dialogues.reduce((acc: any, dialogue: any) => {
      if (dialogue.characterName && dialogue.voiceId) {
        acc[dialogue.characterName] = dialogue.voiceId;
      }
      return acc;
    }, {});

    return NextResponse.json(voiceAssignments);

  } catch (error) {
    console.error('Error fetching voice assignments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 