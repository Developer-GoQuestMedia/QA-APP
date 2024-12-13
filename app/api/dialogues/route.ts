import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { authOptions } from '../../../lib/auth'

export async function GET(request: Request) {
  console.log('=== API Dialogues Route Debug ===');
  
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      console.log('No session found');
      return new NextResponse(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const collection = searchParams.get('collection');

    console.log('Query params:', { projectId, collection });

    if (!projectId) {
      console.log('No projectId provided');
      return new NextResponse(
        JSON.stringify({ error: 'Project ID is required' }),
        { status: 400 }
      );
    }

    // Validate projectId format
    if (!ObjectId.isValid(projectId)) {
      console.log('Invalid projectId format');
      return new NextResponse(
        JSON.stringify({ error: 'Invalid project ID format' }),
        { status: 400 }
      );
    }

    // Connect to database
    const { db } = await connectToDatabase();
    console.log('Connected to database');

    // Get project to verify collection name
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(projectId)
    });

    if (!project) {
      console.log('Project not found');
      return new NextResponse(
        JSON.stringify({ error: 'Project not found' }),
        { status: 404 }
      );
    }

    // Determine collection name from project
    const collectionName = project.dialogue_collection || collection || 'dialogues';
    console.log('Using collection:', collectionName);

    // Fetch dialogues
    const dialogues = await db.collection(collectionName)
      .find({ projectId: new ObjectId(projectId) })
      .sort({ timeStart: 1 })
      .toArray();

    // Transform ObjectIds to strings for JSON serialization
    const serializedDialogues = dialogues.map(dialogue => ({
      ...dialogue,
      _id: dialogue._id.toString(),
      projectId: dialogue.projectId.toString()
    }));

    console.log(`Found ${dialogues.length} dialogues`);
    console.log('=== End Debug ===');

    return new NextResponse(
      JSON.stringify({ 
        data: serializedDialogues,
        collection: collectionName,
        project: {
          title: project.title,
          sourceLanguage: project.sourceLanguage,
          targetLanguage: project.targetLanguage
        }
      }),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error in dialogues route:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  console.log('\n=== POST /api/dialogues - Started ===')
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      console.error('Unauthorized access attempt to create dialogue')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()
    const { projectId, dialogue, collection } = data

    console.log('Creating dialogue:', {
      projectId,
      collection,
      dialoguePreview: dialogue ? {
        timeStart: dialogue.timeStart,
        timeEnd: dialogue.timeEnd,
        character: dialogue.character
      } : 'none'
    })

    if (!projectId || !dialogue) {
      console.error('Missing required fields')
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    console.log('Connecting to database...')
    const { db } = await connectToDatabase()

    // Get project to verify collection name
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(projectId)
    })

    if (!project) {
      console.error('Project not found:', projectId)
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Use the collection from request, project, or default
    const dialogueCollection = collection || project.dialogue_collection || 'dialogues'

    console.log('Using collection:', dialogueCollection)

    // Get the next index
    const lastDialogue = await db.collection(dialogueCollection)
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

    console.log('Creating new dialogue:', {
      collection: dialogueCollection,
      index: nextIndex,
      projectId
    })

    const result = await db.collection(dialogueCollection).insertOne(newDialogue)

    const response = {
      ...newDialogue,
      _id: result.insertedId.toString(),
      projectId: projectId
    }

    console.log('=== POST /api/dialogues - Completed ===\n')
    return NextResponse.json(response)
  } catch (error) {
    console.error('Error creating dialogue:', error)
    return NextResponse.json(
      { error: 'Failed to create dialogue' },
      { status: 500 }
    )
  }
}

