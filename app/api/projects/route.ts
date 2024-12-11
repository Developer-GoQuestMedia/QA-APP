import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'

export async function GET() {
  try {
    const { db } = await connectToDatabase()
    console.log('Connected to database')
    const projects = await db.collection('projects').find({}).toArray()
    console.log('Found projects:', projects)
    return NextResponse.json(projects)
  } catch (error) {
    console.error('Failed to fetch projects:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { db } = await connectToDatabase()
    const projectData = await req.json()
    
    // Add assignedTo array if not present
    const projectToCreate = {
      ...projectData,
      assignedTo: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    const result = await db.collection('projects').insertOne(projectToCreate)
    return NextResponse.json({ success: true, projectId: result.insertedId })
  } catch (error) {
    console.error('Failed to create project:', error)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}

