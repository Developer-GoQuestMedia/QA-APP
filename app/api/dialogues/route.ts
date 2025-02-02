import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { authOptions } from '@/lib/auth'

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
    // 1. Auth check (voiceOver)
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      console.log('Unauthorized access attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parse query params
    const { searchParams } = new URL(request.url)
    const databaseName = searchParams.get('databaseName')
    const collectionName = searchParams.get('collectionName')

    console.log('Query parameters:', { databaseName, collectionName })

    if (!databaseName || !collectionName) {
      return NextResponse.json(
        { error: 'databaseName and collectionName are required' },
        { status: 400 }
      )
    }

    // 3. Connect to MasterDB
    const { client } = await connectToDatabase()
    const masterDbName = process.env.MONGODB_DB || 'MasterDB'
    const masterDb = client.db(masterDbName)

    // 4. Find project by databaseName + voiceOver role
    const project = await masterDb.collection('projects').findOne({
      databaseName,
      assignedTo: {
        $elemMatch: {
          username: session.user.username,
          role: 'voiceOver'
        }
      }
    })
    if (!project) {
      console.log('Project not found or user not authorized')
      return NextResponse.json(
        { error: 'Project not found or unauthorized' },
        { status: 404 }
      )
    }

    // 5. Find the matching episode
    const episode = project.episodes?.find(
      (ep: any) => ep.collectionName === collectionName
    )
    if (!episode) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
    }

    // 6. Switch to the dialogues DB
    const dialoguesDb = client.db(databaseName)

    // 7. Fetch *all* docs in that collection (no filter)
    const scenes = await dialoguesDb
      .collection(collectionName)
      .find()
      .toArray()

    if (!scenes || scenes.length === 0) {
      return NextResponse.json({ error: 'No scenes found' }, { status: 404 })
    }

    // 8. Combine all .dialogues arrays
    let combinedDialogues: any[] = []
    for (const scene of scenes) {
      if (Array.isArray(scene.dialogues)) {
        combinedDialogues = combinedDialogues.concat(scene.dialogues)
      }
    }

    console.log(
      `Found ${scenes.length} doc(s) in ${collectionName}. Combined dialogues = ${combinedDialogues.length}`
    )

    // 9. Return the dialogues + minimal project/episode info
    return NextResponse.json({
      data: combinedDialogues,
      episode: {
        name: episode.name,
        status: episode.status
      },
      project: {
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
