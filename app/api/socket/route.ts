import { NextRequest, NextResponse } from 'next/server';
import { Server as SocketIOServer } from 'socket.io';
import { Server as NetServer } from 'http';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/auth.config';
import { initSocketServer } from '@/lib/socket';

// Map to store active connections
const activeConnections = new Map<string, { userId?: string; rooms: Set<string> }>();

// Socket.IO server instance
let io: SocketIOServer | undefined;

// Extend the Server type to include our io property
declare module 'http' {
  interface Server {
    io?: SocketIOServer;
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      console.error('Socket authentication failed: No session found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the server instance
    const server = (req as any).socket?.server as NetServer;
    
    if (!server) {
      console.error('Socket initialization failed: HTTP Server not available');
      return NextResponse.json({ error: 'Server not available' }, { status: 500 });
    }

    // Initialize Socket.IO if not already initialized
    if (!server.io) {
      console.log('Initializing Socket.IO server...');
      io = initSocketServer(server);
      server.io = io;
    } else {
      io = server.io;
    }

    // Return success response with CORS headers
    return new NextResponse(JSON.stringify({ 
      success: true,
      message: 'Socket.IO server initialized successfully',
      timestamp: new Date().toISOString()
    }), {
      headers: {
        'Access-Control-Allow-Origin': process.env.NODE_ENV === 'production' 
          ? 'https://qa-app-inky.vercel.app'
          : '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Socket initialization error:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Handle OPTIONS request for CORS
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': process.env.NODE_ENV === 'production' 
        ? 'https://qa-app-inky.vercel.app'
        : '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
} 