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
    console.log('Request body received:', {
      dialogueId: params.dialogueId,
      hasVoiceId: !!body.voiceId,
      hasConvertedAudio: !!body.ai_converted_voiceover_url,
      fields: {
        dialogue: !!body.dialogue,
        character: !!body.character,
        projectId: !!body.projectId,
        sceneNumber: !!body.sceneNumber
      }
    });

    const { dialogue, character, status, timeStart, timeEnd, projectId, sceneNumber } = body;

    if (!dialogue || !projectId || !sceneNumber) {
      console.error('Missing required fields:', {
        dialogueId: params.dialogueId,
        fields: {
          dialogue: !!dialogue,
          projectId: !!projectId,
          sceneNumber: !!sceneNumber
        }
      });
      return NextResponse.json({ 
        error: 'Missing required fields',
        details: { dialogue: !!dialogue, projectId, sceneNumber }
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

    // 4. Connect to master database
    const { db: masterDb, client } = await connectToDatabase();
    
    // 5. Get project details
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

    console.log('Found project:', {
      projectId,
      databaseName: projectDoc.databaseName,
      episodeCount: projectDoc.episodes?.length
    });

    // 6. Connect to project's database
    const projectDb = client.db(projectDoc.databaseName);
    
    // 7. Find episode collection
    const paddedEpisodeNumber = padNumber(dialogueComponents.episodeNumber);
    const episode = projectDoc.episodes.find((ep: any) => {
      const match = ep.collectionName.match(/_Ep_(\d+)$/);
      return match && match[1] === paddedEpisodeNumber;
    });

    if (!episode) {
      console.error('Episode not found:', {
        episodeNumber: paddedEpisodeNumber,
        projectId,
        dialogueId: params.dialogueId
      });
      throw new Error(`Episode ${paddedEpisodeNumber} not found in project`);
    }

    console.log('Found episode:', {
      episodeNumber: paddedEpisodeNumber,
      collectionName: episode.collectionName
    });

    // 8. Prepare update fields with voice data
    interface UpdateFields {
      [key: string]: any; // Allow dynamic field names
      'dialogues.$.dialogue': any;
      'dialogues.$.characterName': string;
      'dialogues.$.status': string;
      'dialogues.$.timeStart': number;
      'dialogues.$.timeEnd': number;
      'dialogues.$.directorNotes'?: string;
      'dialogues.$.revisionRequested': boolean;
      'dialogues.$.needsReRecord': boolean;
      'dialogues.$.voiceOverUrl'?: string;
      'dialogues.$.voiceOverNotes'?: string;
      'dialogues.$.subtitleIndex': number;
      'dialogues.$.index': number;
      'dialogues.$.updatedAt': Date;
      'dialogues.$.updatedBy': string;
      'dialogues.$.voiceId'?: string;
      'dialogues.$.ai_converted_voiceover_url'?: string;
    }

    // Log the full request body for voice updates
    if (body.voiceId) {
      console.log('Voice Update Request:', {
        dialogueId: params.dialogueId,
        voiceId: body.voiceId,
        requestBody: body,
        collection: episode.collectionName,
        context: {
          databaseName: projectDoc.databaseName,
          projectId,
          character: body.character
        }
      });
    }

    const updateFields: UpdateFields = {
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
    };

    // Add voice-related fields if present
    if (body.voiceId) {
      updateFields['dialogues.$.voiceId'] = body.voiceId;
      console.log('Including voice ID in update fields:', {
        dialogueId: params.dialogueId,
        voiceId: body.voiceId,
        updateFields: {
          ...updateFields,
          'dialogues.$.voiceId': body.voiceId
        }
      });
    }

    if (body.ai_converted_voiceover_url) {
      updateFields['dialogues.$.ai_converted_voiceover_url'] = body.ai_converted_voiceover_url;
    }

    // 9. Update dialogue in database
    console.log('Executing update operation:', {
      dialogueId: params.dialogueId,
      collection: episode.collectionName,
      query: { 'dialogues.dialogNumber': params.dialogueId },
      updateFields: JSON.stringify(updateFields)
    });

    const updateResult = await projectDb.collection(episode.collectionName).updateOne(
      { 
        'dialogues.dialogNumber': params.dialogueId
      },
      { $set: updateFields }
    );

    if (updateResult.matchedCount === 0) {
      console.error('Failed to update dialogue:', {
        dialogueId: params.dialogueId,
        collection: episode.collectionName,
        error: 'No matching document found',
        query: { 'dialogues.dialogNumber': params.dialogueId }
      });
      throw new Error(`Dialogue ${params.dialogueId} not found in episode collection ${episode.collectionName}`);
    }

    // 10. Fetch the updated dialogue with explicit projection
    const updatedDoc = await projectDb.collection(episode.collectionName).findOne(
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
        collection: episode.collectionName,
        updateResult: {
          matchedCount: updateResult.matchedCount,
          modifiedCount: updateResult.modifiedCount
        }
      });
      throw new Error('Failed to fetch updated dialogue');
    }

    const updatedDialogue = updatedDoc.dialogues[0];

    // Verify voice data update
    if (body.voiceId && updatedDialogue.voiceId !== body.voiceId) {
      console.error('Voice ID verification failed:', {
        dialogueId: params.dialogueId,
        expectedVoiceId: body.voiceId,
        actualVoiceId: updatedDialogue.voiceId,
        collection: episode.collectionName
      });
      throw new Error('Voice ID update verification failed');
    }

    // Log successful update with full dialogue data
    console.log('Update successful:', {
      dialogueId: params.dialogueId,
      collection: episode.collectionName,
      updateResult: {
        matchedCount: updateResult.matchedCount,
        modifiedCount: updateResult.modifiedCount
      },
      updatedDialogue: {
        dialogNumber: updatedDialogue.dialogNumber,
        character: updatedDialogue.characterName,
        voiceId: updatedDialogue.voiceId,
        status: updatedDialogue.status
      }
    });

    return NextResponse.json({
      ...updatedDialogue,
      dialogNumber: params.dialogueId,
      projectId,
      databaseName: projectDoc.databaseName,
      collectionName: episode.collectionName
    });

  } catch (error: any) {
    const errorContext = {
      error: error.message,
      stack: error.stack,
      params: params,
      timestamp: new Date().toISOString(),
      requestBody: request.body ? await request.clone().json() : undefined
    };
    
    console.error('Error updating dialogue:', errorContext);
    
    return NextResponse.json({ 
      error: 'Failed to update dialogue',
      details: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 