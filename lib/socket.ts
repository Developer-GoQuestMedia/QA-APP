import { Server } from 'socket.io';
import type { Server as HTTPServer } from 'http';

let io: Server | null = null;
const activeConnections = new Map<string, { userId?: string; rooms: Set<string> }>();

export function initSocketServer(server: HTTPServer) {
  if (io) {
    console.warn('Socket.io server already initialized');
    return io;
  }

  io = new Server(server, {
    cors: {
      origin: "*", // or your specific domain
      methods: ["GET", "POST"],
    },
    // Add ping timeout and interval settings
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

    // Handle joining project rooms with cleanup
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

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', {
        socketId: socket.id,
        error,
        timestamp: new Date().toISOString()
      });
    });
  });

  return io;
}

export function getSocketInstance() {
  if (!io) {
    console.warn('Socket.io instance not initialized, attempting to handle gracefully');
    return {
      emit: (event: string, data: any) => {
        console.log('Socket event queued (socket not initialized):', { event, data });
      }
    };
  }
  return io;
}

export function setSocketInstance(instance: Server) {
  io = instance;
}

// Add utility functions for connection management
export function getActiveConnections() {
  return {
    total: activeConnections.size,
    connections: Array.from(activeConnections.entries()).map(([socketId, data]) => ({
      socketId,
      userId: data.userId,
      rooms: Array.from(data.rooms)
    }))
  };
}

export function disconnectUser(userId: string) {
  Array.from(activeConnections.entries()).forEach(([socketId, connection]) => {
    if (connection.userId === userId) {
      const socket = io?.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
        console.log('Forced user disconnect:', {
          socketId,
          userId,
          timestamp: new Date().toISOString()
        });
      }
    }
  });
}
