// import { NextResponse } from 'next/server'
// import { connectToDatabase } from '@/lib/mongodb'

// export async function GET() {
//   try {
//     const { db } = await connectToDatabase()
//     console.log('Connected to database')
//     const projects = await db.collection('projects').find({}).toArray()
//     console.log('Found projects:', projects)
//     return NextResponse.json(projects)
//   } catch (error) {
//     console.error('Failed to fetch projects:', error)
//     return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
//   }
// }

// export async function POST(req: Request) {
//   try {
//     const { db } = await connectToDatabase()
//     const projectData = await req.json()
    
//     // Add assignedTo array if not present
//     const projectToCreate = {
//       ...projectData,
//       assignedTo: [],
//       createdAt: new Date(),
//       updatedAt: new Date()
//     }
    
//     const result = await db.collection('projects').insertOne(projectToCreate)
//     return NextResponse.json({ success: true, projectId: result.insertedId })
//   } catch (error) {
//     console.error('Failed to create project:', error)
//     return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
//   }
// }

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { ObjectId } from 'mongodb'
import { connectToDatabase } from '@/lib/mongodb'
import { authOptions } from '@/lib/auth'

export async function GET(request: Request) {
  console.log('=== GET /api/projects - Start ===')
  try {
    // STEP 1: (Optional) Check for authentication
    //         Remove if your endpoint doesn't require a session.
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // STEP 2: Parse query string for `projectId`
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    // STEP 3: Connect to the database
    const { db } = await connectToDatabase()
    console.log('Connected to database')

    // If NO `projectId`, return ALL projects
    if (!projectId) {
      console.log('Fetching ALL projects')
      const projects = await db.collection('projects').find({}).toArray()

      // Serialize each project's _id and each episode's _id
      const serializedProjects = projects.map((proj: any) => ({
        ...proj,
        _id: proj._id.toString(),
        episodes: proj.episodes?.map((ep: any) => ({
          ...ep,
          _id: ep._id.toString()
        })),
      }))

      console.log(`Found ${serializedProjects.length} projects`)
      return NextResponse.json(serializedProjects)
    }

    // If `projectId` is provided, validate & fetch a SINGLE project
    console.log('Fetching single project, projectId =', projectId)

    // (Optional) If your ID must be a valid 24-char hex:
    if (!ObjectId.isValid(projectId)) {
      return NextResponse.json({ error: 'Invalid projectId' }, { status: 400 })
    }

    // STEP 4: Fetch the specific project by _id
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(projectId)
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // STEP 5: Serialize the ObjectIds for JSON
    const serializedProject = {
      ...project,
      _id: project._id.toString(),
      episodes: project.episodes?.map((ep: any) => ({
        ...ep,
        _id: ep._id.toString()
      }))
    }

    console.log('Returning single project:', serializedProject._id)
    return NextResponse.json(serializedProject)

  } catch (error) {
    console.error('Failed in GET /api/projects:', error)
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const { db } = await connectToDatabase()
    const projectData = await req.json()

    // Add assignedTo if not present
    const projectToCreate = {
      ...projectData,
      assignedTo: projectData.assignedTo || [],
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
