import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ObjectId, Document } from 'mongodb';

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
    const { usernames } = body;

    if (!usernames || !Array.isArray(usernames)) {
      return NextResponse.json(
        { error: 'Invalid usernames' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    // Get users to assign by username
    const users = await db.collection('users')
      .find(
        { 
          username: { $in: usernames },
          isActive: true 
        },
        { projection: { username: 1, email: 1, role: 1 } }
      )
      .toArray();

    console.log('Users to assign:', users);
    console.log('Mapped users for assignment:', users.map(user => ({
      username: user.username,
      role: user.role
    })));

    if (users.length !== usernames.length) {
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
          assignedTo: users.map(user => ({
            username: user.username,
            role: user.role
          })),
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
    const { usernames } = body;

    if (!usernames || !Array.isArray(usernames)) {
      return NextResponse.json(
        { error: 'Invalid usernames' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    // First get the project
    const project = await db.collection('projects').findOne(
      { _id: new ObjectId(params.projectId) }
    );

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Filter out the users to remove
    const updatedAssignedTo = project.assignedTo.filter(
      (user: { username: string }) => !usernames.includes(user.username)
    );

    console.log('Original assigned users:', project.assignedTo);
    console.log('Usernames to remove:', usernames);
    console.log('Updated assigned users:', updatedAssignedTo);

    // Update the project with the filtered users
    const result = await db.collection('projects').updateOne(
      { _id: new ObjectId(params.projectId) },
      { 
        $set: { 
          assignedTo: updatedAssignedTo,
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