import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET all projects
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    // Check if user is authenticated and is an admin
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized access' },
        { status: 401 }
      );
    }

    const { db } = await connectToDatabase();
    const projects = await db.collection('projects')
      .find({})
      .sort({ updatedAt: -1 })
      .toArray();

    return NextResponse.json({ success: true, data: projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

// POST create new project
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized access' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { title, description, sourceLanguage, targetLanguage, dialogue_collection } = body;

    // Validate required fields
    if (!title || !description || !sourceLanguage || !targetLanguage || !dialogue_collection) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    
    const newProject = {
      title,
      description,
      sourceLanguage,
      targetLanguage,
      dialogue_collection,
      status: 'pending',
      assignedTo: [],
      videoPath: `${title}/videos/`,  // Default video path structure
      updatedAt: new Date(),
      createdAt: new Date()
    };

    const result = await db.collection('projects').insertOne(newProject);

    return NextResponse.json({
      success: true,
      data: { ...newProject, _id: result.insertedId }
    });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
} 