import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/auth.config'
import { NextRequest } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { dialogueId: string } }
) {
  console.log('GET /api/dialogues/[dialogueId] - Started', { dialogueId: params.dialogueId })
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      console.error('Unauthorized access attempt to dialogue')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!ObjectId.isValid(params.dialogueId)) {
      console.error('Invalid dialogue ID format:', params.dialogueId)
      return NextResponse.json({ error: 'Invalid dialogue ID format' }, { status: 400 })
    }

    console.log('Connecting to database...')
    const { db } = await connectToDatabase()

    // First try to find the dialogue in any collection by checking project's dialogue_collection
    let dialogue = null;

    // Try to find the dialogue in any collection by checking all projects
    const projects = await db.collection('projects').find().toArray();
    
    for (const project of projects) {
      if (project.dialogue_collection) {
        const tempDialogue = await db.collection(project.dialogue_collection).findOne({
          _id: new ObjectId(params.dialogueId)
        });
        if (tempDialogue) {
          dialogue = tempDialogue;
          break;
        }
      }
    }

    // If still not found, try the default collection
    if (!dialogue) {
      dialogue = await db.collection('dialogues').findOne({
        _id: new ObjectId(params.dialogueId)
      });
    }

    if (!dialogue) {
      console.error('Dialogue not found:', params.dialogueId)
      return NextResponse.json({ error: 'Dialogue not found' }, { status: 404 })
    }

    // Check project access
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(dialogue.projectId),
      'assignedTo': {
        $elemMatch: {
          username: session.user.username
        }
      }
    })

    if (!project) {
      console.error('User not authorized for this dialogue')
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Transform ObjectIds to strings
    const serializedDialogue = {
      ...dialogue,
      _id: dialogue._id.toString(),
      projectId: dialogue.projectId.toString()
    }

    return NextResponse.json(serializedDialogue)
  } catch (error) {
    console.error('Error fetching dialogue:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dialogue' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { dialogueId: string } }
) {
  console.log('PUT /api/dialogues/[dialogueId] - Started', { dialogueId: params.dialogueId })
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      console.error('Unauthorized access attempt to update dialogue')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!ObjectId.isValid(params.dialogueId)) {
      console.error('Invalid dialogue ID format:', params.dialogueId)
      return NextResponse.json({ error: 'Invalid dialogue ID format' }, { status: 400 })
    }

    const updates = await request.json()
    console.log('Requested updates:', updates)

    // Handle voice-over deletion
    if (updates.deleteVoiceOver) {
      console.log('Deleting voice-over for dialogue:', params.dialogueId);
      updates.voiceOverUrl = null;
      updates.status = 'pending';
    }
    // Validate voiceOverUrl if status is voice-over-added
    else if (updates.status === 'voice-over-added' && !updates.voiceOverUrl) {
      console.error('Missing voiceOverUrl for voice-over-added status');
      return NextResponse.json(
        { error: 'Voice-over URL is required when status is voice-over-added' },
        { status: 400 }
      );
    }

    console.log('Connecting to database...')
    const { db } = await connectToDatabase()

    // First try to find the dialogue in any collection by checking project's dialogue_collection
    let dialogue = null;
    let dialogueCollection = 'dialogues';

    // Try to find the dialogue in any collection by checking all projects
    const projects = await db.collection('projects').find().toArray();
    
    for (const project of projects) {
      if (project.dialogue_collection) {
        const tempDialogue = await db.collection(project.dialogue_collection).findOne({
          _id: new ObjectId(params.dialogueId)
        });
        if (tempDialogue) {
          dialogue = tempDialogue;
          dialogueCollection = project.dialogue_collection;
          break;
        }
      }
    }

    // If still not found, try the default collection
    if (!dialogue) {
      dialogue = await db.collection('dialogues').findOne({
        _id: new ObjectId(params.dialogueId)
      });
    }

    if (!dialogue) {
      console.error('Dialogue not found:', params.dialogueId)
      return NextResponse.json({ error: 'Dialogue not found' }, { status: 404 })
    }

    // Check project access
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(dialogue.projectId),
      'assignedTo': {
        $elemMatch: {
          username: session.user.username,
          role: { $in: ['transcriber', 'voiceOver'] }
        }
      }
    })

    if (!project) {
      console.error('User not authorized to update this dialogue:', {
        username: session.user.username,
        dialogueId: params.dialogueId,
        projectId: dialogue.projectId
      })
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Prepare update data
    const updateData = {
      ...updates,
      updatedAt: new Date(),
      updatedBy: session.user.username
    }

    // Don't allow updating certain fields
    delete updateData._id
    delete updateData.projectId
    delete updateData.createdAt
    delete updateData.createdBy

    console.log('Applying updates:', updateData)
    const result = await db.collection(dialogueCollection).findOneAndUpdate(
      { _id: new ObjectId(params.dialogueId) },
      { $set: updateData },
      { returnDocument: 'after' }
    )

    if (!result) {
      console.error('Failed to update dialogue:', {
        id: params.dialogueId,
        collection: dialogueCollection,
        updateData
      });
      return NextResponse.json({ error: 'Failed to update dialogue' }, { status: 500 })
    }

    console.log('Update successful:', {
      id: params.dialogueId,
      collection: dialogueCollection,
      status: result.status,
      voiceOverUrl: result.voiceOverUrl
    });

    // Transform ObjectIds to strings
    const serializedDialogue = {
      ...result,
      _id: result._id.toString(),
      projectId: result.projectId.toString()
    }

    return NextResponse.json(serializedDialogue)
  } catch (error) {
    console.error('Error updating dialogue:', error)
    return NextResponse.json(
      { error: 'Failed to update dialogue' },
      { status: 500 }
    )
  }
}

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
          'dialogues.$.status': status || 'transcribed',
          'dialogues.$.timeStart': timeStart,
          'dialogues.$.timeEnd': timeEnd,
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

    // 10. Return success response
    return NextResponse.json(updatedDialogue);

  } catch (error: any) {
    console.error('Error updating dialogue:', error);
    return NextResponse.json({ 
      error: 'Failed to update dialogue',
      details: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { dialogueId: string } }
) {
  console.log('DELETE /api/dialogues/[dialogueId] - Started', { dialogueId: params.dialogueId })
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      console.error('Unauthorized access attempt to delete dialogue')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!ObjectId.isValid(params.dialogueId)) {
      console.error('Invalid dialogue ID format:', params.dialogueId)
      return NextResponse.json({ error: 'Invalid dialogue ID format' }, { status: 400 })
    }

    console.log('Connecting to database...')
    const { db } = await connectToDatabase()

    // First try to find the dialogue in any collection by checking project's dialogue_collection
    let dialogue = null;

    // Try to find the dialogue in any collection by checking all projects
    const projects = await db.collection('projects').find().toArray();
    
    for (const project of projects) {
      if (project.dialogue_collection) {
        const tempDialogue = await db.collection(project.dialogue_collection).findOne({
          _id: new ObjectId(params.dialogueId)
        });
        if (tempDialogue) {
          dialogue = tempDialogue;
          break;
        }
      }
    }

    // If still not found, try the default collection
    if (!dialogue) {
      dialogue = await db.collection('dialogues').findOne({
        _id: new ObjectId(params.dialogueId)
      });
    }

    if (!dialogue) {
      console.error('Dialogue not found:', params.dialogueId)
      return NextResponse.json({ error: 'Dialogue not found' }, { status: 404 })
    }

    // Check project access
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(dialogue.projectId),
      'assignedTo': {
        $elemMatch: {
          username: session.user.username
        }
      }
    })

    if (!project) {
      console.error('User not authorized to delete this dialogue')
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    console.log('Deleting dialogue:', params.dialogueId)
    const result = await db.collection('dialogues').deleteOne({
      _id: new ObjectId(params.dialogueId)
    })

    if (result.deletedCount === 0) {
      console.error('Failed to delete dialogue:', params.dialogueId)
      return NextResponse.json({ error: 'Failed to delete dialogue' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting dialogue:', error)
    return NextResponse.json(
      { error: 'Failed to delete dialogue' },
      { status: 500 }
    )
  }
} 