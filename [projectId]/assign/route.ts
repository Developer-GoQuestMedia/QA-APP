import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/auth.config'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { username, role } = await request.json()
    const projectId = params.id

    if (!username || !role || !projectId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const { db } = await connectToDatabase()

    // First get the current project to check if user is already assigned
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(projectId)
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Check if user is already assigned with the same role
    const isAlreadyAssigned = project.assignedTo?.some(
      (assignment: { username: string; role: string }) =>
        assignment.username === username && assignment.role === role
    )

    if (isAlreadyAssigned) {
      return NextResponse.json(
        { error: 'User is already assigned with this role' },
        { status: 400 }
      )
    }

    // Update the project with the new assignment
    const result = await db.collection('projects').findOneAndUpdate(
      { _id: new ObjectId(projectId) },
      {
        $addToSet: { 
          assignedTo: { username, role }
        },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    )

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to update project' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'User assigned successfully',
      project: {
        ...result,
        _id: result._id.toString()
      }
    })
  } catch (error) {
    console.error('Error assigning user to project:', error)
    return NextResponse.json(
      { error: 'Failed to assign user to project' },
      { status: 500 }
    )
  }
}

