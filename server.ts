import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initSocketServer } from './lib/socket';
import { Server } from 'socket.io';
import logger from './lib/logger';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Prepare Next.js
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

let io: Server | null = null;

app.prepare().then(() => {
  // Create HTTP server
  const server = createServer(async (req, res) => {
    try {
      // Parse URL
      const parsedUrl = parse(req.url!, true);
      
      // Handle socket.io requests
      if (parsedUrl.pathname?.startsWith('/socket.io/')) {
        // Only allow WebSocket upgrade requests
        if (req.headers.upgrade?.toLowerCase() === 'websocket') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
          res.setHeader('Access-Control-Allow-Credentials', 'true');
          return;
        } else {
          // Reject non-WebSocket requests to socket.io endpoint
          res.writeHead(426, { 'Upgrade-Required': 'WebSocket' });
          res.end('WebSocket upgrade required');
          return;
        }
      }

      // Handle Next.js requests
      await handle(req, res, parsedUrl);
    } catch (err) {
      logger.error('Error handling request:', { error: err });
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // Initialize Socket.IO with proper error handling
  try {
    if (!io) {
      io = initSocketServer(server);
      logger.info('Socket.IO server initialized successfully');

      // Handle WebSocket upgrade
      const upgradeHandler = (request: any, socket: any, head: any) => {
        const pathname = parse(request.url).pathname;
        
        if (pathname?.startsWith('/socket.io/')) {
          if (io?.engine) {
            try {
              io.engine.handleUpgrade(request, socket, head);
              logger.info('WebSocket upgrade successful:', {
                path: pathname,
                timestamp: new Date().toISOString()
              });
            } catch (error) {
              logger.error('Error handling socket upgrade:', { error });
              socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
            }
          } else {
            logger.error('Socket.IO engine not available');
            socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
          }
        }
      };

      // Remove any existing upgrade listeners
      server.removeAllListeners('upgrade');
      
      // Add the new upgrade handler
      server.on('upgrade', upgradeHandler);

      // Log transport changes
      io.on('connection', (socket) => {
        logger.info('New connection:', {
          socketId: socket.id,
          transport: socket.conn.transport.name,
          remoteAddress: socket.handshake.address,
          timestamp: new Date().toISOString()
        });
        
        socket.conn.on('upgrade', (transport) => {
          logger.info('Connection upgraded:', {
            socketId: socket.id,
            transport: transport.name,
            timestamp: new Date().toISOString()
          });
        });

        socket.on('error', (error) => {
          logger.error('Socket error:', {
            socketId: socket.id,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
          });
        });
      });
    }
  } catch (error) {
    logger.error('Failed to initialize Socket.IO server:', { error });
  }

  // Start listening with error handling
  server.listen(port, () => {
    logger.info(`Server listening at http://${hostname}:${port} as ${dev ? 'development' : 'production'}`);
  }).on('error', (err) => {
    logger.error('Failed to start server:', { error: err });
    process.exit(1);
  });

  // Handle server shutdown
  const signals = ['SIGTERM', 'SIGINT'] as const;
  signals.forEach((signal) => {
    process.on(signal, () => {
      logger.info(`${signal} signal received. Closing HTTP server...`);
      
      // Clean up Socket.IO connections
      if (io) {
        io.close(() => {
          logger.info('Socket.IO server closed');
          server.close(() => {
            logger.info('HTTP server closed');
            process.exit(0);
          });
        });
      } else {
        server.close(() => {
          logger.info('HTTP server closed');
          process.exit(0);
        });
      }
    });
  });
}); 