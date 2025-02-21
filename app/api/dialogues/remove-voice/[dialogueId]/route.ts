import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/auth.config';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

// Configure request handling
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Helper function to parse dialogue number
function parseDialogueNumber(dialogueNumber: string) {
  const parts = dialogueNumber.split('.');
  if (parts.length !== 4) {
    throw new Error('Invalid dialogue number format. Expected format: projectNumber.episodeNumber.sceneNumber.dialogueNumber');
  }
  return {
    projectNumber: parts[0],
    episodeNumber: parts[1],
    sceneNumber: parts[2],
    dialogueNumber: parts[3]
  };
}

function padNumber(num: string | number): string {
  return num.toString().padStart(2, '0');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { dialogueId: string } }
) {
  try {
    // 1. Authorization check
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const databaseName = searchParams.get('databaseName');
    const collectionName = searchParams.get('collectionName');

    if (!projectId || !databaseName || !collectionName) {
      console.error('Missing required parameters:', {
        projectId,
        databaseName,
        collectionName,
        dialogueId: params.dialogueId
      });
      return NextResponse.json({ 
        error: 'Missing required parameters',
        details: { projectId, databaseName, collectionName }
      }, { status: 400 });
    }

    // 3. Parse dialogue number
    let dialogueComponents;
    try {
      dialogueComponents = parseDialogueNumber(params.dialogueId);
      console.log('Parsed dialogue components:', {
        dialogueId: params.dialogueId,
        components: dialogueComponents
      });
    } catch (error) {
      console.error('Failed to parse dialogue number:', {
        dialogueId: params.dialogueId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }

    // 4. Connect to database
    const { db: masterDb, client } = await connectToDatabase();
    
    // 5. Verify project exists
    const projectDoc = await masterDb.collection('projects').findOne(
      { _id: new ObjectId(projectId) }
    );

    if (!projectDoc) {
      console.error('Project not found:', {
        projectId,
        dialogueId: params.dialogueId
      });
      throw new Error('Project not found in master database');
    }

    // 6. Connect to project database
    const projectDb = client.db(databaseName);

    // 7. Prepare update to remove voiceId
    const updateFields = {
      'dialogues.$.voiceId': null,
      'dialogues.$.updatedAt': new Date(),
      'dialogues.$.updatedBy': session.user.id
    };

    console.log('Executing voice removal operation:', {
      dialogueId: params.dialogueId,
      collection: collectionName,
      query: { 'dialogues.dialogNumber': params.dialogueId },
      updateFields: JSON.stringify(updateFields)
    });

    // 8. Update dialogue to remove voiceId
    const updateResult = await projectDb.collection(collectionName).updateOne(
      { 
        'dialogues.dialogNumber': params.dialogueId
      },
      { $set: updateFields }
    );

    if (updateResult.matchedCount === 0) {
      console.error('Failed to remove voice ID:', {
        dialogueId: params.dialogueId,
        collection: collectionName,
        error: 'No matching document found',
        query: { 'dialogues.dialogNumber': params.dialogueId }
      });
      throw new Error(`Dialogue ${params.dialogueId} not found in episode collection ${collectionName}`);
    }

    // 9. Fetch the updated dialogue
    const updatedDoc = await projectDb.collection(collectionName).findOne(
      { 'dialogues.dialogNumber': params.dialogueId },
      { 
        projection: { 
          'dialogues.$': 1,
          '_id': 1
        } 
      }
    );

    if (!updatedDoc?.dialogues?.[0]) {
      console.error('Failed to fetch updated dialogue:', {
        dialogueId: params.dialogueId,
        collection: collectionName,
        updateResult: {
          matchedCount: updateResult.matchedCount,
          modifiedCount: updateResult.modifiedCount
        }
      });
      throw new Error('Failed to fetch updated dialogue');
    }

    // 10. Return success response with updated dialogue
    return NextResponse.json({
      success: true,
      message: 'Voice ID removed successfully',
      dialogue: updatedDoc.dialogues[0],
      updateInfo: {
        matchedCount: updateResult.matchedCount,
        modifiedCount: updateResult.modifiedCount,
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error('Error removing voice ID:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      dialogueId: params.dialogueId
    });

    return NextResponse.json({
      error: 'Failed to remove voice ID',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 