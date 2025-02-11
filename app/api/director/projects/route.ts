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
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify director role
    if (session.user.role !== 'director') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { db } = await connectToDatabase()

    // Get projects assigned to the director
    const projects = await db.collection('projects')
      .find({
        'assignedTo': {
          $elemMatch: {
            username: session.user.username,
            role: 'director'
          }
        }
      })
      .sort({ updatedAt: -1 })
      .toArray()

    return NextResponse.json({
      data: projects,
      count: projects.length,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Error fetching director projects:', error)
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    )
  }
} 