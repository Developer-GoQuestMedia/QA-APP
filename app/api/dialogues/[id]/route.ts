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

    const dialogue = await db.collection('dialogues').findOne({
      _id: new ObjectId(params.id)
    })

    if (!dialogue) {
      console.error('Dialogue not found:', params.id)
      return NextResponse.json({ error: 'Dialogue not found' }, { status: 404 })
    }

    // Check project access
    const project = await db.collection('projects').findOne({
      _id: dialogue.project,
      'assignedTo.username': session.user.username
    })

    if (!project) {
      console.error('User not authorized for this dialogue')
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Transform ObjectIds to strings
    const serializedDialogue = {
      ...dialogue,
      _id: dialogue._id.toString(),
      project: dialogue.project.toString()
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

    console.log('Connecting to database...')
    const { db } = await connectToDatabase()

    // Get the dialogue to check project access
    const existingDialogue = await db.collection('dialogues').findOne({
      _id: new ObjectId(params.id)
    })

    if (!existingDialogue) {
      console.error('Dialogue not found:', params.id)
      return NextResponse.json({ error: 'Dialogue not found' }, { status: 404 })
    }

    // Check project access
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(existingDialogue.project),
      'assignedTo': {
        $elemMatch: {
          username: session.user.username,
          role: 'transcriber'
        }
      }
    })

    if (!project) {
      console.error('User not authorized to update this dialogue:', {
        username: session.user.username,
        dialogueId: params.id,
        projectId: existingDialogue.project
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
    delete updateData.project
    delete updateData.createdAt
    delete updateData.createdBy

    console.log('Applying updates:', updateData)
    const result = await db.collection('dialogues').findOneAndUpdate(
      { _id: new ObjectId(params.id) },
      { $set: updateData },
      { returnDocument: 'after' }
    )

    if (!result) {
      console.error('Failed to update dialogue:', params.id)
      return NextResponse.json({ error: 'Failed to update dialogue' }, { status: 500 })
    }

    // Transform ObjectIds to strings
    const serializedDialogue = {
      ...result,
      _id: result._id.toString(),
      project: result.project.toString()
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
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const data = await request.json();
    const dialogueId = params.id;

    // Verify dialogue exists and user has access
    const dialogue = await db.collection('dialogues').findOne({
      _id: new ObjectId(dialogueId)
    });

    if (!dialogue) {
      return NextResponse.json({ error: 'Dialogue not found' }, { status: 404 });
    }

    // Update the dialogue
    const result = await db.collection('dialogues').updateOne(
      { _id: new ObjectId(dialogueId) },
      { 
        $set: {
          ...data,
          updatedAt: new Date(),
          updatedBy: session.user.email
        } 
      }
    );

    if (result.modifiedCount === 0) {
      return NextResponse.json(
        { error: 'Failed to update dialogue' },
        { status: 400 }
      );
    }

    // Return the updated dialogue
    const updatedDialogue = await db.collection('dialogues').findOne({
      _id: new ObjectId(dialogueId)
    });

    return NextResponse.json(updatedDialogue);
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

    // Get the dialogue to check project access
    const dialogue = await db.collection('dialogues').findOne({
      _id: new ObjectId(params.id)
    })

    if (!dialogue) {
      console.error('Dialogue not found:', params.id)
      return NextResponse.json({ error: 'Dialogue not found' }, { status: 404 })
    }

    // Check project access
    const project = await db.collection('projects').findOne({
      _id: dialogue.project,
      'assignedTo.username': session.user.username
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