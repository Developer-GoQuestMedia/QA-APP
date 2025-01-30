import { Server } from 'socket.io';
import type { Server as HTTPServer } from 'http';

let io: Server | null = null;

export function initSocketServer(server: HTTPServer) {
  io = new Server(server, {
    cors: {
      origin: "*", // or your domain
      methods: ["GET", "POST"],
    },
  });

  // Example usage:
  io.on('connection', (socket) => {
    console.log('New socket connected:', socket.id);

    // Listen for a 'joinProjectRoom' event
    socket.on('joinProjectRoom', ({ projectId }) => {
      socket.join(`project-${projectId}`);
    });
  });

  return io;
}

export function getSocketInstance() {
  if (!io) {
    throw new Error('Socket.io instance not initialized!');
  }
  return io;
}

export function setSocketInstance(instance: Server) {
  io = instance;
}
