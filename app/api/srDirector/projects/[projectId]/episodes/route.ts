/*import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'
import { rateLimit } from '@/lib/rate-limit'
import { ObjectId } from 'mongodb'

interface RouteParams {
  params: {
    projectId: string
  }
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify role
    if (session.user.role !== 'srDirector') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Apply rate limiting
    const limiter = await rateLimit()
    const isRateLimited = await limiter.isRateLimited()
    if (isRateLimited) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    // Validate projectId
    const { projectId } = params
    if (!projectId || !ObjectId.isValid(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    }

    // Connect to database
    const { db } = await connectToDatabase()

    // Verify project exists and user has access
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(projectId)
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Fetch episodes with dialogue counts
    const episodes = await db
      .collection('episodes')
      .aggregate([
        {
          $match: {
            projectId: new ObjectId(projectId)
          }
        },
        {
          $lookup: {
            from: 'dialogues',
            localField: '_id',
            foreignField: 'episodeId',
            as: 'dialogues'
          }
        },
        {
          $addFields: {
            dialogueCount: { $size: '$dialogues' },
            completedDialogues: {
              $size: {
                $filter: {
                  input: '$dialogues',
                  as: 'dialogue',
                  cond: { $eq: ['$$dialogue.status', 'completed'] }
                }
              }
            }
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            status: 1,
            dialogueCount: 1,
            completedDialogues: 1,
            createdAt: 1,
            updatedAt: 1
          }
        },
        {
          $sort: { name: 1 }
        }
      ])
      .toArray()

    return NextResponse.json({ data: episodes }, { status: 200 })
  } catch (error) {
    console.error('Error fetching episodes:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} */

  import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

interface RouteParams {
  params: {
    projectId: string
  }
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    // Get the session
    const session = await getServerSession(authOptions)
    
    // Check if the session exists
    if (!session || !session.user) {
      console.log('Unauthorized access attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Session Info:', session)  // Log session info for debugging

    // Check if the user is a senior director
    if (session.user.role !== 'srDirector') {
      console.log('Access forbidden for user with role:', session.user.role)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Validate projectId
    const { projectId } = params
    if (!projectId || !ObjectId.isValid(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    }

    // Connect to the database
    const { db } = await connectToDatabase()

    // Find the project by ID
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(projectId)
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Fetch episodes for this project
    const episodes = await db.collection('episodes').aggregate([
      {
        $match: { projectId: new ObjectId(projectId) }
      },
      {
        $lookup: {
          from: 'dialogues',
          localField: '_id',
          foreignField: 'episodeId',
          as: 'dialogues'
        }
      },
      {
        $addFields: {
          dialogueCount: { $size: '$dialogues' },
          completedDialogues: {
            $size: {
              $filter: {
                input: '$dialogues',
                as: 'dialogue',
                cond: { $eq: ['$$dialogue.status', 'completed'] }
              }
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          status: 1,
          dialogueCount: 1,
          completedDialogues: 1,
          createdAt: 1,
          updatedAt: 1
        }
      },
      { $sort: { name: 1 } }
    ]).toArray()

    return NextResponse.json({ data: episodes }, { status: 200 })
  } catch (error) {
    console.error('Error fetching episodes:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
