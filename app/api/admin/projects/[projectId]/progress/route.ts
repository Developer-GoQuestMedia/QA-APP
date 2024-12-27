import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized access' },
        { status: 401 }
      );
    }

    const { db } = await connectToDatabase();
    
    // Get project to verify collection name
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(params.projectId)
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Get dialogues from the project's collection
    const dialogues = await db.collection(project.dialogue_collection)
      .find({ projectId: new ObjectId(params.projectId) })
      .toArray();

    const total = dialogues.length;
    
    // Calculate progress statistics
    const stats = dialogues.reduce((acc, dialogue) => {
      if (dialogue.dialogue?.original) acc.transcribed++;
      if (dialogue.dialogue?.translated) acc.translated++;
      if (dialogue.voiceOverUrl) acc.voiceOver++;
      if (dialogue.status === 'approved') acc.approved++;
      return acc;
    }, {
      transcribed: 0,
      translated: 0,
      voiceOver: 0,
      approved: 0
    });

    // Convert to percentages
    const progress = {
      transcribed: total > 0 ? Math.round((stats.transcribed / total) * 100) : 0,
      translated: total > 0 ? Math.round((stats.translated / total) * 100) : 0,
      voiceOver: total > 0 ? Math.round((stats.voiceOver / total) * 100) : 0,
      approved: total > 0 ? Math.round((stats.approved / total) * 100) : 0,
      total,
      lastUpdated: project.updatedAt
    };

    return NextResponse.json({
      success: true,
      data: progress
    });
  } catch (error) {
    console.error('Error fetching project progress:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project progress' },
      { status: 500 }
    );
  }
} 