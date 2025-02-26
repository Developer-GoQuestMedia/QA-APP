import winston, { format, Logger } from 'winston';

// Check if we're in Edge Runtime
const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge';

// Simple logger for Edge Runtime
class EdgeLogger {
  private level: string;

  constructor(level: string = 'info') {
    this.level = level;
  }

  private getLogLevel(level: string): number {
    const levels = {
      error: 0,
      warn: 1,
      info: 2,
      http: 3,
      debug: 4
    };
    return levels[level as keyof typeof levels] || 2;
  }

  private shouldLog(messageLevel: string): boolean {
    return this.getLogLevel(messageLevel) <= this.getLogLevel(this.level);
  }

  private formatLog(level: string, message: string, metadata: any = {}): string {
    const timestamp = new Date().toISOString();
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...(Object.keys(metadata).length > 0 ? { metadata } : {})
    });
  }

  error(message: string, metadata?: any) {
    if (this.shouldLog('error')) {
      console.error(this.formatLog('error', message, metadata));
    }
  }

  warn(message: string, metadata?: any) {
    if (this.shouldLog('warn')) {
      console.warn(this.formatLog('warn', message, metadata));
    }
  }

  info(message: string, metadata?: any) {
    if (this.shouldLog('info')) {
      console.log(this.formatLog('info', message, metadata));
    }
  }

  http(message: string, metadata?: any) {
    if (this.shouldLog('http')) {
      console.log(this.formatLog('http', message, metadata));
    }
  }

  debug(message: string, metadata?: any) {
    if (this.shouldLog('debug')) {
      console.debug(this.formatLog('debug', message, metadata));
    }
  }
}

// Winston logger setup for Node.js runtime
const setupWinstonLogger = () => {
  const { combine, timestamp, printf, errors } = format;

  // Custom log format
  const logFormat = printf(info => {
    const { level, message, timestamp, ...metadata } = info;
    return JSON.stringify({
      timestamp: timestamp || new Date().toISOString(),
      level,
      message,
      ...(Object.keys(metadata).length > 0 ? { metadata } : {})
    });
  });

  // Create transports array based on environment
  const transports = [];

  if (process.env.NODE_ENV === 'development') {
    // In development, only use console transport
    transports.push(
      new winston.transports.Console({
        format: combine(
          format.colorize(),
          timestamp(),
          logFormat
        ),
      })
    );
  } else {
    // In production, use file transports
    transports.push(
      new winston.transports.File({
        filename: './logs/error.log',
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: './logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: './logs/http.log',
        level: 'http',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    );
  }

  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
      errors({ stack: true }),
      timestamp(),
      logFormat
    ),
    transports,
    // Handle uncaught exceptions and unhandled rejections
    exceptionHandlers: [
      new winston.transports.File({
        filename: './logs/exceptions.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    ],
    rejectionHandlers: [
      new winston.transports.File({
        filename: './logs/rejections.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    ],
  });

  return logger;
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
  logger.http(message, requestLog);
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
  logger.http(message, responseLog);
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