import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function GET() {
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

    // Connect to database
    const { db } = await connectToDatabase()

    // Fetch projects with episode counts
    const projects = await db
      .collection('projects')
      .aggregate([
        {
          $lookup: {
            from: 'episodes',
            localField: '_id',
            foreignField: 'projectId',
            as: 'episodes'
          }
        },
        {
          $addFields: {
            episodeCount: { $size: '$episodes' },
            completedEpisodes: {
              $size: {
                $filter: {
                  input: '$episodes',
                  as: 'episode',
                  cond: { $eq: ['$$episode.status', 'completed'] }
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
            episodeCount: 1,
            completedEpisodes: 1
          }
        }
      ])
      .toArray()

    return NextResponse.json({ data: projects }, { status: 200 })
  } catch (error) {
    console.error('Error fetching Sr. Director projects:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 