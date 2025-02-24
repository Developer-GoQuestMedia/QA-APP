import winston, { format, Logger } from 'winston';

// Check if we're in Edge Runtime
const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge';

// Simple logger for Edge Runtime
class EdgeLogger {
  private level: string;

  constructor(level: string = 'info') {
    this.level = level;
  }

  private log(level: string, message: string, metadata: any = {}) {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} [${level}]: ${message}`;
    console.log(logMessage, Object.keys(metadata).length ? metadata : '');
  }

  error(message: string, metadata?: any) {
    this.log('error', message, metadata);
  }

  warn(message: string, metadata?: any) {
    this.log('warn', message, metadata);
  }

  info(message: string, metadata?: any) {
    this.log('info', message, metadata);
  }

  http(message: string, metadata?: any) {
    this.log('http', message, metadata);
  }

  debug(message: string, metadata?: any) {
    this.log('debug', message, metadata);
  }
}

// Winston logger setup for Node.js runtime
const setupWinstonLogger = () => {
  const { combine, timestamp, printf, colorize, errors } = format;

  // Custom log format
  const logFormat = printf(info => {
    const { level, message, timestamp, ...metadata } = info;
    
    let msg = `${timestamp || new Date().toISOString()} [${level}]: ${message}`;
    
    if (Object.keys(metadata).length > 0) {
      msg += `\nMetadata: ${JSON.stringify(metadata, null, 2)}`;
    }
    
    return msg;
  });

  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
      errors({ stack: true }),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      logFormat
    ),
    transports: [
      new winston.transports.Console({
        format: combine(
          colorize({ all: true }),
          timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          logFormat
        ),
      }),
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
      }),
    ],
  });
};

// Create the appropriate logger based on runtime
const logger = isEdgeRuntime ? new EdgeLogger() : setupWinstonLogger();

// Define request type
interface RequestContext {
  id?: string;
  method?: string;
  url?: string;
  ip?: string;
}

// Define log context type
interface LogContext {
  [key: string]: any;
}

// Add request context logging
export const logRequest = (req: RequestContext, message: string, metadata: LogContext = {}) => {
  const requestLog = {
    requestId: req.id,
    method: req.method,
    url: req.url,
    ip: req.ip,
    ...metadata,
  };
  logger.info(message, requestLog);
};

// Add response context logging
export const logResponse = (
  req: RequestContext,
  res: { statusCode: number; responseTime?: number },
  message: string,
  metadata: LogContext = {}
) => {
  const responseLog = {
    requestId: req.id,
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    responseTime: res.responseTime,
    ...metadata,
  };
  logger.info(message, responseLog);
};

// Add error context logging
export const logError = (error: Error, req?: RequestContext, metadata: LogContext = {}) => {
  const errorLog = {
    requestId: req?.id,
    method: req?.method,
    url: req?.url,
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...metadata,
  };
  logger.error('Error occurred', errorLog);
};

export default logger;