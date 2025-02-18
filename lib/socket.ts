import { Server } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { io as createSocketClient } from 'socket.io-client';
import type { ServerOptions } from 'socket.io';

let io: Server | null = null;
const activeConnections = new Map<string, { userId?: string; rooms: Set<string> }>();
let socket: ReturnType<typeof createSocketClient> | null = null;
let isInitializing = false;

// Add connection state tracking
let lastConnectionAttempt = 0;
const MIN_RECONNECTION_DELAY = 5000; // 5 seconds

// Unified socket configuration
const SOCKET_CONFIG: Partial<ServerOptions> = {
  path: '/socket.io/',
  transports: ['websocket'],
  allowUpgrades: false,
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://qa-app-brown.vercel.app']
      : '*',
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  allowEIO3: true,
  cookie: false
};

// Add type definitions for transport error
interface TransportError {
  message: string;
  type: string;
  description?: string;
}

export function initSocketServer(server: HTTPServer) {
  if (io) {
    console.warn('Socket.io server already initialized');
    return io;
  }

  // Prevent rapid reinitializations
  const now = Date.now();
  if (now - lastConnectionAttempt < MIN_RECONNECTION_DELAY) {
    console.warn('Attempted to reinitialize socket too quickly, skipping...');
    return io;
  }
  lastConnectionAttempt = now;

  io = new Server(server, SOCKET_CONFIG);

  io.on('connection', (socket) => {
    // Check if connection already exists
    if (activeConnections.has(socket.id)) {
      console.warn('Duplicate connection detected:', socket.id);
      return;
    }

    console.log('Socket connected:', {
      socketId: socket.id,
      transport: socket.conn.transport.name,
      activeConnections: activeConnections.size,
      timestamp: new Date().toISOString()
    });

    // Initialize connection tracking
    activeConnections.set(socket.id, { rooms: new Set() });

    // Handle authentication
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

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      const connection = activeConnections.get(socket.id);
      if (connection) {
        console.log('Socket disconnected:', {
          socketId: socket.id,
          userId: connection.userId,
          reason,
          timestamp: new Date().toISOString()
        });
        activeConnections.delete(socket.id);
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', {
        socketId: socket.id,
        error: error instanceof Error ? error.message : String(error),
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
      : 'http://localhost:3000';

    console.log('Initializing socket client with URL:', baseUrl);

    const clientConfig = {
      path: '/socket.io/',
      transports: ['websocket'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 3000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      forceNew: true,
      withCredentials: true,
      upgrade: true,
      rejectUnauthorized: false,
      transportOptions: {
        polling: {
          extraHeaders: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        }
      }
    };

    socket = createSocketClient(baseUrl, clientConfig);

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', {
        error: error.message,
        attempt: reconnectAttempts + 1,
        maxAttempts: maxReconnectAttempts,
        url: baseUrl,
        timestamp: new Date().toISOString(),
        transport: socket?.io?.engine?.transport?.name
      });

      // Only increment attempts for connection refused errors
      if (error.message.includes('xhr poll error') || error.message.includes('Connection refused')) {
        reconnectAttempts++;
      }

      if (reconnectAttempts >= maxReconnectAttempts) {
        console.error('Max reconnection attempts reached, stopping reconnection');
        socket?.disconnect();
        socket = null;
        isInitializing = false;
      }
    });

    socket.on('connect', () => {
      console.log('Socket client connected successfully:', {
        socketId: socket?.id,
        url: baseUrl,
        transport: socket?.io?.engine?.transport?.name,
        timestamp: new Date().toISOString(),
      });
      reconnectAttempts = 0;
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', {
        reason,
        socketId: socket?.id,
        timestamp: new Date().toISOString(),
        wasConnected: socket?.connected,
        transport: socket?.io?.engine?.transport?.name
      });

      if (reason === 'io server disconnect' || reason === 'transport error') {
        socket = null;
        isInitializing = false;
      }
    });

    // Add transport error logging with proper types
    if (socket.io?.engine) {
      socket.io.engine.on('error', (err: string | Error) => {
        const error = typeof err === 'string' ? { message: err, type: 'transport' } : {
          message: err.message,
          type: 'transport',
          description: err.stack
        };

        console.error('Transport error:', {
          ...error,
          transport: socket?.io?.engine?.transport?.name,
          timestamp: new Date().toISOString()
        });
      });
    }

    // Manually initiate connection
    socket.connect();

    return socket;
  } catch (error) {
    console.error('Failed to initialize socket client:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
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
