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
    const { db } = await connectToDatabase()

    const dialoguesCollection = db.collection('dialogues')
    const existingDialogue = await dialoguesCollection.findOne({
      _id: new ObjectId(params.id)
    })

    if (!existingDialogue) {
      console.error('Dialogue not found:', params.id)
      return NextResponse.json({ error: 'Dialogue not found' }, { status: 404 })
    }

    // Extract the numeric index value
    const indexValue = existingDialogue.index?.$numberInt 
      ? parseInt(existingDialogue.index.$numberInt) 
      : typeof existingDialogue.index === 'string' 
        ? parseInt(existingDialogue.index) 
        : existingDialogue.index

    // If projectId exists in the document, use it directly
    let projectId;
    if (existingDialogue.projectId) {
      try {
        projectId = new ObjectId(existingDialogue.projectId)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        console.error('Invalid existing projectId format:', existingDialogue.projectId, errorMessage)
        return NextResponse.json({ error: 'Invalid project ID format in dialogue' }, { status: 400 })
      }
    } else {
      // Look for other dialogues with the same index
      const otherDialogue = await dialoguesCollection.findOne(
        { 
          index: indexValue,
          projectId: { $exists: true, $ne: null }
        },
        { sort: { _id: 1 } }
      )

      if (otherDialogue?.projectId) {
        try {
          projectId = new ObjectId(otherDialogue.projectId)
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error'
          console.error('Invalid project ID from other dialogue:', otherDialogue.projectId, errorMessage)
          return NextResponse.json({ error: 'Invalid project ID format in related dialogue' }, { status: 400 })
        }
      } else {
        // If still no project found, look for the first project assigned to the user
        const projectsCollection = db.collection('projects')
        const userProject = await projectsCollection.findOne({
          'assignedTo': {
            $elemMatch: {
              username: session.user.username,
              role: 'transcriber'
            }
          }
        })

        if (!userProject) {
          console.error('No projects found for user:', session.user.username)
          return NextResponse.json({ error: 'No projects found for user' }, { status: 400 })
        }

        projectId = userProject._id
      }
    }

    // Check project access
    const project = await db.collection('projects').findOne({
      _id: projectId,
      'assignedTo': {
        $elemMatch: {
          username: session.user.username,
          role: 'transcriber'
        }
      }
    })

    if (!project) {
      console.error('Project access denied:', {
        username: session.user.username,
        projectId: projectId.toString(),
        dialogueId: params.id
      })
      return NextResponse.json({ error: 'Not authorized for this project' }, { status: 403 })
    }

    // Prepare update data
    const updateData = {
      dialogue: {
        original: updates.dialogue.original.trim(),
        translated: (updates.dialogue.translated || '').trim(),
        adapted: (updates.dialogue.adapted || '').trim(),
      },
      character: (updates.character || '').trim(),
      status: updates.status || existingDialogue.status,
      timeStart: updates.timeStart || existingDialogue.timeStart,
      timeEnd: updates.timeEnd || existingDialogue.timeEnd,
      index: indexValue,
      projectId: projectId,
      updatedAt: new Date(),
      updatedBy: session.user.username
    }

    const result = await dialoguesCollection.findOneAndUpdate(
      { _id: new ObjectId(params.id) },
      { $set: updateData },
      { returnDocument: 'after' }
    )

    if (!result) {
      console.error('Failed to update dialogue:', params.id)
      return NextResponse.json({ error: 'Failed to update dialogue' }, { status: 500 })
    }

    // Transform ObjectIds to strings for response
    const serializedDialogue = {
      ...result,
      _id: result._id.toString(),
      projectId: result.projectId.toString()
    }

    return NextResponse.json(serializedDialogue)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    const errorStack = err instanceof Error ? err.stack : undefined
    
    console.error('Error updating dialogue:', {
      error: errorMessage,
      stack: errorStack
    })
    
    return NextResponse.json(
      { error: `Failed to update dialogue: ${errorMessage}` },
      { status: 500 }
    )
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