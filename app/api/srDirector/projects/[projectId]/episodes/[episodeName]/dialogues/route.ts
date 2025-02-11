import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'
import { rateLimit } from '@/lib/rate-limit'
import { ObjectId } from 'mongodb'

interface RouteParams {
  params: {
    projectId: string
    episodeName: string
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
    const { projectId, episodeName } = params
    if (!projectId || !ObjectId.isValid(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    }

    if (!episodeName) {
      return NextResponse.json({ error: 'Episode name is required' }, { status: 400 })
    }

    // Connect to database
    const { db } = await connectToDatabase()

    // Verify project exists
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(projectId)
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Get episode
    const episode = await db.collection('episodes').findOne({
      projectId: new ObjectId(projectId),
      name: episodeName
    })

    if (!episode) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
    }

    // Fetch dialogues with their assignments and history
    const dialogues = await db
      .collection('dialogues')
      .aggregate([
        {
          $match: {
            episodeId: episode._id
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'assignedTo',
            foreignField: '_id',
            as: 'assignedUser'
          }
        },
        {
          $lookup: {
            from: 'dialogueHistory',
            localField: '_id',
            foreignField: 'dialogueId',
            as: 'history'
          }
        },
        {
          $project: {
            _id: 1,
            dialogueNumber: 1,
            characterName: 1,
            dialogueText: 1,
            status: 1,
            assignedTo: {
              $cond: {
                if: { $gt: [{ $size: '$assignedUser' }, 0] },
                then: {
                  _id: { $arrayElemAt: ['$assignedUser._id', 0] },
                  username: { $arrayElemAt: ['$assignedUser.username', 0] },
                  role: { $arrayElemAt: ['$assignedUser.role', 0] }
                },
                else: null
              }
            },
            history: {
              $map: {
                input: '$history',
                as: 'h',
                in: {
                  _id: '$$h._id',
                  action: '$$h.action',
                  timestamp: '$$h.timestamp',
                  userId: '$$h.userId'
                }
              }
            },
            createdAt: 1,
            updatedAt: 1
          }
        },
        {
          $sort: { dialogueNumber: 1 }
        }
      ])
      .toArray()

    return NextResponse.json({ data: dialogues }, { status: 200 })
  } catch (error) {
    console.error('Error fetching dialogues:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 