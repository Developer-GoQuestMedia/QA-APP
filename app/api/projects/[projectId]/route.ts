import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

// Set runtime config
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate projectId
    const { projectId } = params
    if (!projectId || !ObjectId.isValid(projectId)) {
      return NextResponse.json(
        { error: 'Invalid project ID format' },
        { status: 400 }
      )
    }

    // Connect to MongoDB
    const { db } = await connectToDatabase()

    // Get project details
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(projectId)
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Check if user has access to this project
    const hasAccess = project.assignedTo.some(
      (assignment: { username: string; role: string }) =>
        assignment.username === session.user?.username &&
        ['transcriber', 'translator', 'director', 'voiceOver', 'srDirector'].includes(assignment.role)
    )

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'You do not have access to this project' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      project,
      status: 'success',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error in project API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 