import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/auth.config'

export async function GET(request: Request) {
  console.log('GET /api/dialogues - Started')
  try {
    // Get session for authentication
    const session = await getServerSession(authOptions)
    console.log('Session check:', { 
      hasSession: !!session, 
      user: session?.user,
      headers: Object.fromEntries(request.headers)
    })

    if (!session?.user) {
      console.error('Unauthorized access attempt to dialogues')
      return NextResponse.json(
        { 
          error: 'Unauthorized', 
          message: 'Please log in to access this resource',
          details: 'No valid session found'
        }, 
        { status: 401 }
      )
    }

    // Get projectId from query parameters
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    
    console.log('Fetching dialogues for project:', projectId)

    if (!projectId) {
      console.error('No projectId provided')
      return NextResponse.json(
        { 
          error: 'Bad Request',
          message: 'Project ID is required',
          details: 'Missing projectId query parameter'
        }, 
        { status: 400 }
      )
    }

    // Validate projectId format
    if (!ObjectId.isValid(projectId)) {
      console.error('Invalid projectId format:', projectId)
      return NextResponse.json(
        { 
          error: 'Bad Request',
          message: 'Invalid project ID format',
          details: 'The provided project ID is not a valid MongoDB ObjectId'
        }, 
        { status: 400 }
      )
    }

    // Connect to database
    console.log('Connecting to database...')
    const { db } = await connectToDatabase()

    // Fetch dialogues for the project
    console.log('Fetching dialogues from database...')
    const dialogues = await db.collection('dialogues')
      .find({ projectId: new ObjectId(projectId) })
      .sort({ index: 1 })
      .toArray()

    console.log(`Found ${dialogues.length} dialogues for project ${projectId}`)

    // Transform ObjectId to string for JSON serialization
    const serializedDialogues = dialogues.map(dialogue => ({
      ...dialogue,
      _id: dialogue._id.toString(),
      projectId: dialogue.projectId.toString()
    }))

    return NextResponse.json({
      success: true,
      data: serializedDialogues,
      count: serializedDialogues.length
    })
  } catch (error) {
    console.error('Error fetching dialogues:', error)
    return NextResponse.json(
      { 
        error: 'Internal Server Error',
        message: 'Failed to fetch dialogues',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  console.log('POST /api/dialogues - Started')
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      console.error('Unauthorized access attempt to create dialogue')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()
    const { projectId, dialogue } = data

    if (!projectId || !dialogue) {
      console.error('Missing required fields')
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    console.log('Connecting to database...')
    const { db } = await connectToDatabase()

    // Get the next index
    const lastDialogue = await db.collection('dialogues')
      .findOne({ projectId: new ObjectId(projectId) }, { sort: { index: -1 } })
    
    const nextIndex = (lastDialogue?.index || 0) + 1

    const newDialogue = {
      ...dialogue,
      projectId: new ObjectId(projectId),
      index: nextIndex,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: session.user.username
    }

    console.log('Creating new dialogue:', newDialogue)
    const result = await db.collection('dialogues').insertOne(newDialogue)

    return NextResponse.json({
      ...newDialogue,
      _id: result.insertedId.toString(),
      projectId: projectId
    })
  } catch (error) {
    console.error('Error creating dialogue:', error)
    return NextResponse.json(
      { error: 'Failed to create dialogue' },
      { status: 500 }
    )
  }
}

