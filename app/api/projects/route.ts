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

// Define interfaces based on the actual MongoDB document structure
interface Episode {
  _id: ObjectId | string
  name: string
  collectionName: string
  videoPath: string
  videoKey: string
  status: string
  uploadedAt: Date
}

interface AssignedUser {
  username: string
  role: string
}

interface Project {
  _id: ObjectId | string
  title: string
  description: string
  sourceLanguage: string
  targetLanguage: string
  status: string
  createdAt: Date
  updatedAt: Date
  assignedTo: AssignedUser[]
  parentFolder: string
  databaseName: string
  episodes: Episode[]
  uploadStatus: {
    totalFiles: number
    completedFiles: number
    currentFile: number
    status: string
  }
  index: string
}

export async function GET(request: Request) {
  console.log('=== GET /api/projects - Start ===')
  try {
    // Enhanced session check
    const session = await getServerSession(authOptions)
    console.log('Session check:', {
      exists: !!session,
      user: session?.user,
      timestamp: new Date().toISOString()
    })

    if (!session?.user?.username || !session?.user?.role) {
      console.log('Unauthorized: Invalid session data')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query string for `projectId`
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    // Connect to the database
    const { db } = await connectToDatabase()
    console.log('Connected to database')

    // If NO `projectId`, return ALL projects for admin or assigned projects for other roles
    if (!projectId) {
      console.log('Fetching projects for user:', {
        username: session.user.username,
        role: session.user.role,
        isAdmin: session.user.role === 'admin'
      })

      // For admin users, return all projects without assignment check
      const query = session.user.role === 'admin' 
        ? {} 
        : {
            assignedTo: {
              $elemMatch: {
                username: session.user.username,
                role: session.user.role
              }
            }
          }

      const projects = await db.collection('projects').find(query).toArray() as Project[]

      // Serialize each project's _id and each episode's _id
      const serializedProjects = projects.map((proj: Project) => ({
        ...proj,
        _id: proj._id.toString(),
        episodes: proj.episodes?.map((ep) => ({
          ...ep,
          _id: ep._id.toString()
        })),
      }))

      console.log(`Found ${serializedProjects.length} projects for user`)
      return NextResponse.json(serializedProjects)
    }

    // If `projectId` is provided, validate & fetch a SINGLE project
    console.log('Fetching single project, projectId =', projectId)

    if (!ObjectId.isValid(projectId)) {
      return NextResponse.json({ error: 'Invalid projectId' }, { status: 400 })
    }

    // For admin users, fetch project without assignment check
    const query = session.user.role === 'admin'
      ? { _id: new ObjectId(projectId) }
      : {
          _id: new ObjectId(projectId),
          assignedTo: {
            $elemMatch: {
              username: session.user.username,
              role: session.user.role
            }
          }
        }

    const project = await db.collection('projects').findOne(query) as Project | null

    console.log('Project fetch result:', {
      found: !!project,
      projectId,
      assignedUsers: project?.assignedTo,
      timestamp: new Date().toISOString()
    })

    if (!project) {
      console.log('Project not found or user not authorized:', {
        projectId,
        username: session.user.username,
        role: session.user.role
      })
      return NextResponse.json(
        { error: 'Project not found or unauthorized' },
        { status: 404 }
      )
    }

    // Serialize the ObjectIds for JSON
    const serializedProject = {
      ...project,
      _id: project._id.toString(),
      episodes: project.episodes?.map((ep) => ({
        ...ep,
        _id: ep._id.toString()
      }))
    }

    console.log('Project details:', {
      id: serializedProject._id,
      title: serializedProject.title,
      episodeCount: serializedProject.episodes?.length,
      assignedUsers: serializedProject.assignedTo,
      timestamp: new Date().toISOString()
    })

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
