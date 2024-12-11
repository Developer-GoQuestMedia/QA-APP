import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { db } = await connectToDatabase()
    const { username, role } = await req.json()
    const projectId = params.id

    // Update project
    const result = await db.collection('projects').findOneAndUpdate(
      { _id: new ObjectId(projectId) },
      { 
        $push: { assignedTo: { username, role } },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    )

    if (!result) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Update user
    await db.collection('users').updateOne(
      { username },
      { 
        $push: { assignedProjects: { projectId: new ObjectId(projectId), role } },
        $set: { updatedAt: new Date() }
      }
    )

    return NextResponse.json({ success: true, project: result })
  } catch (error) {
    console.error('Failed to assign project:', error)
    return NextResponse.json({ error: 'Failed to assign project' }, { status: 500 })
  }
}

