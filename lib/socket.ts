import { Server } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { io as createSocketClient } from 'socket.io-client';
import type { ServerOptions } from 'socket.io';

let io: Server | null = null;
const activeConnections = new Map<string, { userId?: string; rooms: Set<string> }>();
let socket: ReturnType<typeof createSocketClient> | null = null;
let isInitializing = false;

// Unified socket configuration
const SOCKET_CONFIG: Partial<ServerOptions> = {
  path: '/socket.io/',
  addTrailingSlash: false,
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://qa-app-brown.vercel.app']
      : '*',
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Access-Control-Allow-Credentials']
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  allowUpgrades: true,
  cookie: {
    name: 'io',
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    domain: process.env.NODE_ENV === 'production' 
      ? 'qa-app-brown.vercel.app'
      : undefined
  },
  connectTimeout: 45000,
  perMessageDeflate: false,
  httpCompression: false
};

export function initSocketServer(server: HTTPServer) {
  if (io) {
    console.warn('Socket.io server already initialized');
    return io;
  }

  io = new Server(server, SOCKET_CONFIG);

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

export function getSocketClient() {
  if (socket) {
    return socket;
  }

  if (isInitializing) {
    console.warn('Socket client initialization already in progress');
    return null;
  }

  try {
    isInitializing = true;
    const baseUrl = process.env.NODE_ENV === 'production'
      ? 'https://qa-app-brown.vercel.app'
      : (process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000');

    console.log('Initializing socket client with URL:', baseUrl);

    const clientConfig = {
      path: SOCKET_CONFIG.path,
      addTrailingSlash: SOCKET_CONFIG.addTrailingSlash,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: SOCKET_CONFIG.transports,
      withCredentials: true,
      secure: process.env.NODE_ENV === 'production'
    };

    socket = createSocketClient(baseUrl, clientConfig);

    socket.on('connect', () => {
      console.log('Socket client connected successfully:', {
        socketId: socket?.id,
        url: baseUrl,
        path: SOCKET_CONFIG.path,
        transport: socket?.io?.engine?.transport?.name,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', {
        error: error.message,
        url: baseUrl,
        timestamp: new Date().toISOString(),
      });
    });

    return socket;
  } catch (error) {
    console.error('Failed to initialize socket client:', error);
    return null;
  } finally {
    isInitializing = false;
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// Export a function to emit events
export function emitSocketEvent(event: string, data: any) {
  const client = getSocketClient();
  if (client) {
    client.emit(event, data);
  }
}

// Export a function to listen to events
export function onSocketEvent(event: string, callback: (data: any) => void) {
  const client = getSocketClient();
  if (client) {
    client.on(event, callback);
  }
}

// Export a function to join a project room
export function joinProjectRoom(projectId: string) {
  const client = getSocketClient();
  if (client) {
    client.emit('joinProjectRoom', { projectId });
  }
}

// Export a function to leave a project room
export function leaveProjectRoom(projectId: string) {
  const client = getSocketClient();
  if (client) {
    client.emit('leaveProjectRoom', { projectId });
  }
}

// Export a function to authenticate the socket connection
export function authenticateSocket(userId: string) {
  const client = getSocketClient();
  if (client) {
    client.emit('authenticate', { userId });
  }
}
