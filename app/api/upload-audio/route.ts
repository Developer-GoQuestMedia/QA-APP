import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { put } from '@vercel/blob'

export async function POST(req: Request) {
  try {
    const { db } = await connectToDatabase()
    const formData = await req.formData()
    const file = formData.get('audio') as File
    const dialogueId = formData.get('dialogueId') as string

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const blob = await put(file.name, file, {
      access: 'public',
    })

    // Update the dialogue with the new audio URL
    await db.collection('dialogues').updateOne(
      { _id: new ObjectId(dialogueId) },
      { $set: { audioUrl: blob.url } }
    )

    return NextResponse.json({ success: true, url: blob.url })
  } catch (error) {
    console.error('Failed to upload audio:', error)
    return NextResponse.json({ error: 'Failed to upload audio' }, { status: 500 })
  }
}

