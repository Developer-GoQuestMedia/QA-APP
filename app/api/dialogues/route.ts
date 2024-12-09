import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')

  if (!projectId) {
    return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
  }

  try {
    const { db } = await connectToDatabase()
    const dialogues = await db.collection('dialogues').find({ project: new ObjectId(projectId) }).toArray()
    return NextResponse.json(dialogues)
  } catch (error) {
    console.error('Failed to fetch dialogues:', error)
    return NextResponse.json({ error: 'Failed to fetch dialogues' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const body = await req.json()
  const { dialogueId, updates } = body

  if (!dialogueId || !updates) {
    return NextResponse.json({ error: 'Dialogue ID and updates are required' }, { status: 400 })
  }

  try {
    const { db } = await connectToDatabase()
    const result = await db.collection('dialogues').updateOne(
      { _id: new ObjectId(dialogueId) },
      { $set: updates }
    )
    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('Failed to update dialogue:', error)
    return NextResponse.json({ error: 'Failed to update dialogue' }, { status: 500 })
  }
}

