import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/auth.config'

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

export async function PATCH(
  request: Request,
  { params }: { params: { dialogueId: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify director or sr director role
    if (!['director', 'srDirector'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { dialogueId } = params
    if (!dialogueId || !ObjectId.isValid(dialogueId)) {
      return NextResponse.json(
        { error: 'Invalid dialogue ID' },
        { status: 400 }
      )
    }

    const updateData = await request.json()
    const { db } = await connectToDatabase()

    // Update the dialogue
    const result = await db.collection('dialogues').findOneAndUpdate(
      { _id: new ObjectId(dialogueId) },
      {
        $set: {
          ...updateData,
          updatedAt: new Date(),
          updatedBy: {
            username: session.user.username,
            role: session.user.role
          }
        }
      },
      { returnDocument: 'after' }
    )

    if (!result) {
      return NextResponse.json(
        { error: 'Dialogue not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Error updating dialogue:', error)
    return NextResponse.json(
      { error: 'Failed to update dialogue' },
      { status: 500 }
    )
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