import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { authOptions } from '@/lib/auth'
import { ObjectId } from 'mongodb'
import { Dialogue } from '@/types/dialogue'

// Define interfaces based on the actual MongoDB document structure
interface Episode {
  _id: ObjectId | string
  name: string
  collectionName: string
  videoPath: string
  videoKey: string
  status: string
  uploadedAt: Date
}

interface AssignedUser {
  username: string
  role: string
}

interface Project {
  _id: ObjectId | string
  title: string
  description: string
  sourceLanguage: string
  targetLanguage: string
  status: string
  createdAt: Date
  updatedAt: Date
  assignedTo: AssignedUser[]
  parentFolder: string
  databaseName: string
  episodes: Episode[]
  uploadStatus: {
    totalFiles: number
    completedFiles: number
    currentFile: number
    status: string
  }
  index: string
}

interface Scene {
  _id: ObjectId | string
  dialogues: Dialogue[]
}

/**
 * GET /api/dialogues?databaseName=...&collectionName=...
 *
 * 1) Auth check
 * 2) Find the project in MasterDB by databaseName
 * 3) Ensure the user has role=voiceOver
 * 4) Get the correct episode from project.episodes by collectionName
 * 5) Connect to the "dialoguesDb" = client.db(databaseName)
 * 6) Fetch all docs from that collection (no filter)
 * 7) Combine all docs' .dialogues arrays into one big array
 * 8) Return the combined dialogues + minimal project + episode info
 */
export async function GET(request: Request) {
  console.log('=== GET /api/dialogues - Started ===')

  try {
    // Enhanced auth check
    const session = await getServerSession(authOptions)
    console.log('Session check:', {
      exists: !!session,
      user: session?.user,
      timestamp: new Date().toISOString()
    })

    if (!session?.user?.username || !session?.user?.role) {
      console.log('Unauthorized: Invalid session data')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query params
    const { searchParams } = new URL(request.url)
    const databaseName = searchParams.get('databaseName')
    const collectionName = searchParams.get('collectionName')

    console.log('Query parameters:', { databaseName, collectionName })

    if (!databaseName || !collectionName) {
      console.log('Missing required parameters')
      return NextResponse.json(
        { error: 'databaseName and collectionName are required' },
        { status: 400 }
      )
    }

    // Connect to MasterDB
    const { client } = await connectToDatabase()
    const masterDbName = process.env.MONGODB_DB || 'MasterDB'
    const masterDb = client.db(masterDbName)

    // Find project by databaseName + voiceOver role
    console.log('Searching for project:', {
      databaseName,
      username: session.user.username,
      role: session.user.role,
      timestamp: new Date().toISOString()
    })

    const project = await masterDb.collection('projects').findOne({
      databaseName,
      assignedTo: {
        $elemMatch: {
          username: session.user.username,
          role: session.user.role
        }
      }
    }) as Project | null

    console.log('Project search result:', {
      found: !!project,
      projectId: project?._id,
      databaseName,
      assignedUsers: project?.assignedTo,
      timestamp: new Date().toISOString()
    })

    if (!project) {
      console.log('Project access denied:', {
        username: session.user.username,
        databaseName,
        timestamp: new Date().toISOString()
      })
      return NextResponse.json(
        { error: 'Project not found or unauthorized' },
        { status: 404 }
      )
    }

    // Find the matching episode
    console.log('Searching for episode:', {
      collectionName,
      projectId: project._id,
      episodeCount: project.episodes?.length,
      timestamp: new Date().toISOString()
    })

    const episode = project.episodes?.find(
      (ep) => ep.collectionName === collectionName
    )
    
    console.log('Episode search result:', {
      found: !!episode,
      episodeName: episode?.name,
      collectionName: episode?.collectionName,
      timestamp: new Date().toISOString()
    })

    if (!episode) {
      console.log('Episode not found:', {
        collectionName,
        projectId: project._id,
        timestamp: new Date().toISOString()
      })
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
    }

    // Switch to the dialogues DB
    const dialoguesDb = client.db(databaseName)

    // Fetch *all* docs in that collection
    const scenes = await dialoguesDb
      .collection(collectionName)
      .find()
      .toArray() as Scene[]

    if (!scenes || scenes.length === 0) {
      console.log('No scenes found:', {
        collectionName,
        databaseName,
        timestamp: new Date().toISOString()
      })
      return NextResponse.json({ error: 'No scenes found' }, { status: 404 })
    }

    // Combine all .dialogues arrays
    let combinedDialogues: Dialogue[] = []
    for (const scene of scenes) {
      if (Array.isArray(scene.dialogues)) {
        combinedDialogues = combinedDialogues.concat(scene.dialogues)
      }
    }

    console.log(
      `Found ${scenes.length} scene(s) with ${combinedDialogues.length} total dialogues`
    )

    // Return the dialogues + minimal project/episode info
    return NextResponse.json({
      data: combinedDialogues,
      episode: {
        _id: episode._id.toString(),
        name: episode.name,
        status: episode.status
      },
      project: {
        _id: project._id.toString(),
        databaseName: project.databaseName,
        title: project.title,
        sourceLanguage: project.sourceLanguage,
        targetLanguage: project.targetLanguage
      }
    })
  } catch (error) {
    console.error('Error fetching dialogues:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dialogues' },
      { status: 500 }
    )
  }
}
