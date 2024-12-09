import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { db } = await connectToDatabase()
    const { username, role } = await req.json()
    const projectId = params.id

    // Update project
    await db.collection('projects').updateOne(
      { _id: new ObjectId(projectId) },
      { $push: { assignedTo: { username, role } } }
    )

    // Update user (assuming you have a users collection)
    await db.collection('users').updateOne(
      { username },
      { $push: { assignedProjects: { projectId: new ObjectId(projectId), role } } }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to assign project:', error)
    return NextResponse.json({ error: 'Failed to assign project' }, { status: 500 })
  }
}

