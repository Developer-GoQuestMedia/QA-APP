import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';

// POST assign users to project
export async function POST(
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

    const body = await request.json();
    const { userIds } = body;

    if (!userIds || !Array.isArray(userIds)) {
      return NextResponse.json(
        { error: 'Invalid user IDs' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    // Get users to assign
    const users = await db.collection('users')
      .find(
        { 
          _id: { $in: userIds.map(id => new ObjectId(id)) },
          isActive: true 
        },
        { projection: { _id: 1, username: 1, email: 1, role: 1 } }
      )
      .toArray();

    if (users.length !== userIds.length) {
      return NextResponse.json(
        { error: 'One or more users not found or inactive' },
        { status: 400 }
      );
    }

    // Update project with assigned users
    const result = await db.collection('projects').updateOne(
      { _id: new ObjectId(params.projectId) },
      { 
        $set: { 
          assignedTo: users,
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Users assigned successfully',
      data: { assignedUsers: users }
    });
  } catch (error) {
    console.error('Error assigning users:', error);
    return NextResponse.json(
      { error: 'Failed to assign users' },
      { status: 500 }
    );
  }
}

// DELETE remove users from project
export async function DELETE(
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

    const body = await request.json();
    const { userIds } = body;

    if (!userIds || !Array.isArray(userIds)) {
      return NextResponse.json(
        { error: 'Invalid user IDs' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    // Remove users from project
    const result = await db.collection('projects').updateOne(
      { _id: new ObjectId(params.projectId) },
      { 
        $pull: { 
          assignedTo: { 
            _id: { 
              $in: userIds.map(id => new ObjectId(id))
            } 
          }
        },
        $set: { updatedAt: new Date() }
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Users removed successfully'
    });
  } catch (error) {
    console.error('Error removing users:', error);
    return NextResponse.json(
      { error: 'Failed to remove users' },
      { status: 500 }
    );
  }
} 