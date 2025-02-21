import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function POST(
  request: NextRequest,
  { params }: { params: { episodeId: string; dialogueId: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get parameters
    const { episodeId, dialogueId } = params;
    const { projectId, updates } = await request.json();

    if (!episodeId || !dialogueId || !projectId || !updates) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Connect to database
    const { db } = await connectToDatabase();

    // Update the dialogue in the project's episode
    const result = await db.collection('projects').updateOne(
      {
        _id: new ObjectId(projectId),
        'episodes._id': new ObjectId(episodeId),
        'episodes.steps.transcription.transcriptionData.dialogues.id': dialogueId
      },
      {
        $set: {
          'episodes.$[episode].steps.transcription.transcriptionData.dialogues.$[dialogue]': {
            ...updates,
            id: dialogueId // Ensure we keep the original ID
          }
        }
      },
      {
        arrayFilters: [
          { 'episode._id': new ObjectId(episodeId) },
          { 'dialogue.id': dialogueId }
        ]
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Dialogue not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Dialogue updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating dialogue:', error);
    return NextResponse.json(
      {
        error: 'Failed to update dialogue',
        details: error.message
      },
      { status: 500 }
    );
  }
} 