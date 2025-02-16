import { Server as NetServer } from 'http';
import { NextRequest, NextResponse } from 'next/server';
import { Server as SocketIOServer } from 'socket.io';
import { initSocketServer } from '@/lib/socket';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Set runtime config
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    // Initialize Socket.IO if not already initialized
    if (!io) {
      // Access the server from the request
      const server = (req as any).socket?.server as NetServer;

      if (!server) {
        console.error('Socket initialization failed: HTTP Server not available');
        throw new Error('HTTP Server not available');
      }

      if (!server.io) {
        console.log('Initializing Socket.IO server...');
        io = initSocketServer(server);
      } else {
        io = server.io;
      }
    }

    // Return success response with CORS headers
    return new NextResponse(JSON.stringify({ 
      success: true,
      message: 'Socket.IO server initialized successfully',
      timestamp: new Date().toISOString()
    }), {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Access-Control-Allow-Credentials',
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    console.error('Error in Socket.IO initialization:', error);
    return NextResponse.json({ 
      error: 'Failed to initialize Socket.IO',
      details: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 