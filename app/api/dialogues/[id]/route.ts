import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/auth.config'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  console.log('GET /api/dialogues/[id] - Started', { id: params.id })
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      console.error('Unauthorized access attempt to dialogue')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!ObjectId.isValid(params.id)) {
      console.error('Invalid dialogue ID format:', params.id)
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
          _id: new ObjectId(params.id)
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
        _id: new ObjectId(params.id)
      });
    }

    if (!dialogue) {
      console.error('Dialogue not found:', params.id)
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
  { params }: { params: { id: string } }
) {
  console.log('PUT /api/dialogues/[id] - Started', { id: params.id })
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      console.error('Unauthorized access attempt to update dialogue')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!ObjectId.isValid(params.id)) {
      console.error('Invalid dialogue ID format:', params.id)
      return NextResponse.json({ error: 'Invalid dialogue ID format' }, { status: 400 })
    }

    const updates = await request.json()
    console.log('Requested updates:', updates)

    // Handle voice-over deletion
    if (updates.deleteVoiceOver) {
      console.log('Deleting voice-over for dialogue:', params.id);
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
          _id: new ObjectId(params.id)
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
        _id: new ObjectId(params.id)
      });
    }

    if (!dialogue) {
      console.error('Dialogue not found:', params.id)
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
        dialogueId: params.id,
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
      { _id: new ObjectId(params.id) },
      { $set: updateData },
      { returnDocument: 'after' }
    )

    if (!result) {
      console.error('Failed to update dialogue:', {
        id: params.id,
        collection: dialogueCollection,
        updateData
      });
      return NextResponse.json({ error: 'Failed to update dialogue' }, { status: 500 })
    }

    console.log('Update successful:', {
      id: params.id,
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

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  console.log('=== PATCH /api/dialogues/[id] Debug ===');
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      console.log('Authentication failed: No session');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const data = await request.json();
    const dialogueId = params.id;

    console.log('Request data:', {
      dialogueId,
      data,
      userEmail: session.user?.email
    });

    // Validate required fields
    if (!data.dialogue || !data.projectId) {
      console.log('Validation failed:', { 
        hasDialogue: !!data.dialogue, 
        hasProjectId: !!data.projectId 
      });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // First try to find the dialogue
    let dialogue = null;
    let dialogueCollection = 'dialogues';

    console.log('Searching for dialogue in collections...');
    
    // Try to find the dialogue in any collection by checking all projects
    const projects = await db.collection('projects').find().toArray();
    
    for (const project of projects) {
      if (project.dialogue_collection) {
        console.log('Checking collection:', project.dialogue_collection);
        const tempDialogue = await db.collection(project.dialogue_collection).findOne({
          _id: new ObjectId(dialogueId)
        });
        if (tempDialogue) {
          dialogue = tempDialogue;
          dialogueCollection = project.dialogue_collection;
          console.log('Found dialogue in collection:', dialogueCollection);
          break;
        }
      }
    }

    // If still not found, try the default collection
    if (!dialogue) {
      dialogue = await db.collection('dialogues').findOne({
        _id: new ObjectId(dialogueId)
      });
      console.log('Dialogue search result:', { found: !!dialogue });
    }

    if (!dialogue) {
      console.log('Dialogue not found:', dialogueId);
      return NextResponse.json({ error: 'Dialogue not found' }, { status: 404 });
    }

    // Get project to verify access
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(dialogue.projectId),
      'assignedTo': {
        $elemMatch: {
          username: session.user.username
        }
      }
    });

    console.log('Project access check:', {
      projectFound: !!project,
      username: session.user.username
    });

    if (!project) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Prepare update data
    const updateData = {
      dialogue: data.dialogue,
      character: data.character,
      status: data.status,
      timeStart: data.timeStart,
      timeEnd: data.timeEnd,
      index: data.index,
      updatedAt: new Date(),
      updatedBy: session.user.email
    };

    // Update the dialogue in the correct collection
    const result = await db.collection(dialogueCollection).findOneAndUpdate(
      { _id: new ObjectId(dialogueId) },
      { $set: updateData },
      { returnDocument: 'after' }
    );

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to update dialogue' },
        { status: 400 }
      );
    }

    // Transform ObjectIds to strings for response
    const serializedDialogue = {
      ...result,
      _id: result._id.toString(),
      projectId: result.projectId.toString()
    };

    return NextResponse.json(serializedDialogue);
  } catch (error) {
    console.error('Error updating dialogue:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  console.log('DELETE /api/dialogues/[id] - Started', { id: params.id })
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      console.error('Unauthorized access attempt to delete dialogue')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!ObjectId.isValid(params.id)) {
      console.error('Invalid dialogue ID format:', params.id)
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
          _id: new ObjectId(params.id)
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
        _id: new ObjectId(params.id)
      });
    }

    if (!dialogue) {
      console.error('Dialogue not found:', params.id)
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

    console.log('Deleting dialogue:', params.id)
    const result = await db.collection('dialogues').deleteOne({
      _id: new ObjectId(params.id)
    })

    if (result.deletedCount === 0) {
      console.error('Failed to delete dialogue:', params.id)
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