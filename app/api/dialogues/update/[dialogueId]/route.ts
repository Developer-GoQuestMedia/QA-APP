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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { dialogueId: string } }
) {
  try {
    // 1. Authorization check
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request body
    const body = await request.json();
    const { dialogue, character, status, timeStart, timeEnd, projectId, sceneNumber } = body;

    if (!dialogue || !projectId || !sceneNumber) {
      return NextResponse.json({ 
        error: 'Missing required fields',
        details: { dialogue: !!dialogue, projectId, sceneNumber }
      }, { status: 400 });
    }

    // 3. Parse dialogue number
    const dialogueComponents = parseDialogueNumber(params.dialogueId);

    // 4. Connect to master database
    const { db: masterDb, client } = await connectToDatabase();
    
    // 5. Get project details
    const projectDoc = await masterDb.collection('projects').findOne(
      { _id: new ObjectId(projectId) }
    );

    if (!projectDoc) {
      throw new Error('Project not found in master database');
    }

    // 6. Connect to project's database
    const projectDb = client.db(projectDoc.databaseName);
    
    // 7. Find episode collection
    const paddedEpisodeNumber = padNumber(dialogueComponents.episodeNumber);
    const episode = projectDoc.episodes.find((ep: any) => {
      const match = ep.collectionName.match(/_Ep_(\d+)$/);
      return match && match[1] === paddedEpisodeNumber;
    });

    if (!episode) {
      throw new Error(`Episode ${paddedEpisodeNumber} not found in project`);
    }

    // 8. Update dialogue in database
    const updateResult = await projectDb.collection(episode.collectionName).updateOne(
      { 
        'dialogues.dialogNumber': params.dialogueId
      },
      {
        $set: {
          'dialogues.$.dialogue': dialogue,
          'dialogues.$.characterName': character,
          'dialogues.$.status': status || (body.needsReRecord ? 'needs-rerecord' : body.revisionRequested ? 'revision-requested' : 'approved'),
          'dialogues.$.timeStart': timeStart,
          'dialogues.$.timeEnd': timeEnd,
          'dialogues.$.directorNotes': body.directorNotes,
          'dialogues.$.revisionRequested': body.revisionRequested,
          'dialogues.$.needsReRecord': body.needsReRecord,
          'dialogues.$.voiceOverUrl': body.voiceOverUrl,
          'dialogues.$.voiceOverNotes': body.voiceOverNotes,
          'dialogues.$.subtitleIndex': body.subtitleIndex,
          'dialogues.$.index': body.index,
          'dialogues.$.updatedAt': new Date(),
          'dialogues.$.updatedBy': session.user.id
        }
      }
    );

    if (updateResult.matchedCount === 0) {
      throw new Error(`Dialogue ${params.dialogueId} not found in episode collection ${episode.collectionName}`);
    }

    // 9. Fetch the updated dialogue
    const updatedDoc = await projectDb.collection(episode.collectionName).findOne(
      { 'dialogues.dialogNumber': params.dialogueId },
      { projection: { 'dialogues.$': 1 } }
    );

    const updatedDialogue = updatedDoc?.dialogues[0];

    // 10. Return success response with detailed logging
    console.log('Successfully updated dialogue:', {
      dialogueId: params.dialogueId,
      collection: episode.collectionName,
      projectId,
      sceneNumber,
      updatedFields: updatedDialogue
    });

    return NextResponse.json({
      ...updatedDialogue,
      dialogNumber: params.dialogueId,
      projectId,
      databaseName: projectDoc.databaseName,
      collectionName: episode.collectionName
    });

  } catch (error: any) {
    console.error('Error updating dialogue:', {
      error: error.message,
      stack: error.stack,
      params: params
    });
    
    return NextResponse.json({ 
      error: 'Failed to update dialogue',
      details: error.message,
      stack: error.stack
    }, { status: 500 });
  }
} 