import { Server as NetServer } from 'http';
import { NextApiResponse } from 'next';
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

if (!io) {
  const httpServer = new NetServer();
  io = initSocketServer(httpServer);
  httpServer.listen(3001); // Listen on a specific port
}

export async function GET(req: NextRequest) {
  if (!io) {
    return new Response('Socket.io server not initialized', { status: 500 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Initialize Socket.IO if not already initialized
    if (!io) {
      // @ts-expect-error - WebSocket upgrade handler adds socket property to request
      const server = req.socket.server;
      io = new SocketIOServer(server, {
        path: '/api/socket',
        addTrailingSlash: false,
        cors: {
          origin: process.env.NEXTAUTH_URL || "https://qa-app-brown.vercel.app",
          methods: ["GET", "POST"],
          credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000,
      });

      io.on('connection', (socket) => {
        console.log('Socket connected:', {
          socketId: socket.id,
          activeConnections: activeConnections.size,
          timestamp: new Date().toISOString()
        });

        // Initialize connection tracking
        activeConnections.set(socket.id, { rooms: new Set() });

        // Handle user authentication
        socket.on('authenticate', ({ userId }) => {
          if (userId) {
            const connection = activeConnections.get(socket.id);
            if (connection) {
              connection.userId = userId;
              console.log('Socket authenticated:', {
                socketId: socket.id,
                userId,
                timestamp: new Date().toISOString()
              });
            }
          }
        });

        // Handle joining project rooms
        socket.on('joinProjectRoom', ({ projectId }) => {
          if (!projectId) return;

          const roomId = `project-${projectId}`;
          socket.join(roomId);
          
          const connection = activeConnections.get(socket.id);
          if (connection) {
            connection.rooms.add(roomId);
            console.log('Socket joined room:', {
              socketId: socket.id,
              roomId,
              timestamp: new Date().toISOString()
            });
          }
        });

        // Handle leaving project rooms
        socket.on('leaveProjectRoom', ({ projectId }) => {
          if (!projectId) return;

          const roomId = `project-${projectId}`;
          socket.leave(roomId);
          
          const connection = activeConnections.get(socket.id);
          if (connection) {
            connection.rooms.delete(roomId);
            console.log('Socket left room:', {
              socketId: socket.id,
              roomId,
              timestamp: new Date().toISOString()
            });
          }
        });

        // Handle disconnection
        socket.on('disconnect', (reason) => {
          const connection = activeConnections.get(socket.id);
          if (connection) {
            // Leave all rooms
            connection.rooms.forEach(roomId => {
              socket.leave(roomId);
            });
            
            // Remove from active connections
            activeConnections.delete(socket.id);
            
            console.log('Socket disconnected:', {
              socketId: socket.id,
              reason,
              remainingConnections: activeConnections.size,
              timestamp: new Date().toISOString()
            });
          }
        });
      });
    }

    // Return success response
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in Socket.IO initialization:', error);
    return NextResponse.json({ 
      error: 'Failed to initialize Socket.IO',
      details: error.message 
    }, { status: 500 });
  }
} 