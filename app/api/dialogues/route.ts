import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { authOptions } from '../../../lib/auth'

export async function GET(request: Request) {
  console.log('=== GET /api/dialogues - Started ===');
  
  try {
    // 1. Authentication Check
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      console.log('Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get Query Parameters
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const episodeName = searchParams.get('episodeName');

    console.log('Query parameters:', { projectId, episodeName });

    if (!projectId || !episodeName) {
      console.log('Missing required parameters');
      return NextResponse.json(
        { error: 'Project ID and Episode Name are required' },
        { status: 400 }
      );
    }

    // 3. Connect to Database
    const { db } = await connectToDatabase();

    // 4. Find Project and Verify Access
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(projectId),
      'assignedTo': {
        $elemMatch: {
          username: session.user.username,
          role: 'voiceOver'
        }
      }
    });

    if (!project) {
      console.log('Project not found or user not authorized');
      return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 404 });
    }

    // 5. Find Episode in Project
    const episode = project.episodes.find((ep: any) => ep.name === episodeName);
    if (!episode) {
      console.log('Episode not found:', episodeName);
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    console.log('Found episode:', {
      episodeId: episode._id,
      name: episode.name,
      status: episode.status
    });

    // 6. Get Collection Name
    const collectionName = project.dialogue_collection || 'dialogues';
    console.log('Using collection:', collectionName);

    // 7. Fetch Dialogues for Episode
    const dialogues = await db.collection(collectionName)
      .find({
        projectId: new ObjectId(projectId),
        episodeId: episode._id.toString()
      })
      .sort({ timeStart: 1 })
      .toArray();

    console.log(`Found ${dialogues.length} dialogues for episode`);

    // 8. Transform ObjectIds to strings for JSON serialization
    const serializedDialogues = dialogues.map(dialogue => ({
      ...dialogue,
      _id: dialogue._id.toString(),
      projectId: dialogue.projectId.toString(),
      episodeId: dialogue.episodeId.toString()
    }));

    // 9. Return Response with Additional Context
    return NextResponse.json({
      data: serializedDialogues,
      episode: {
        _id: episode._id.toString(),
        name: episode.name,
        status: episode.status
      },
      project: {
        _id: project._id.toString(),
        title: project.title,
        sourceLanguage: project.sourceLanguage,
        targetLanguage: project.targetLanguage
      }
    });

  } catch (error) {
    console.error('Error fetching dialogues:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dialogues' },
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

