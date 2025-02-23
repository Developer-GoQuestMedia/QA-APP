import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function DELETE(req: Request) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { dbName } = body;

    if (!dbName) {
      return NextResponse.json(
        { success: false, error: 'Database name is required' },
        { status: 400 }
      );
    }

    // Connect to MongoDB
    const client = await MongoClient.connect(process.env.MONGODB_URI!);
    
    try {
      // Drop the database
      await client.db(dbName).dropDatabase();

      return NextResponse.json({
        success: true,
        message: 'Database deleted successfully'
      });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Error deleting database:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete database' },
      { status: 500 }
    );
  }
} 