import winston, { format, Logger } from 'winston';

const { combine, timestamp, printf, colorize, errors } = format;

// Define log levels type
interface LogLevels {
  [key: string]: number;
  error: number;
  warn: number;
  info: number;
  http: number;
  debug: number;
}

// Define log colors type
interface LogColors {
  [key: string]: string;
  error: string;
  warn: string;
  info: string;
  http: string;
  debug: string;
}

// Define winston info type
interface WinstonInfo {
  level: string;
  message: string;
  timestamp?: string;
  [key: string]: any;
}

// Custom log levels
const levels: LogLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Custom log colors
const colors: LogColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Add colors to Winston
winston.addColors(colors);

// Custom log format
const logFormat = printf(info => {
  const { level, message, timestamp, ...metadata } = info;
  
  let msg = `${timestamp || new Date().toISOString()} [${level}]: ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    msg += `\nMetadata: ${JSON.stringify(metadata, null, 2)}`;
  }
  
  return msg;
});

// Create the logger
const logger: Logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
      ),
    }),
    // Write all logs with level 'error' and below to 'error.log'
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    // Write all logs to 'combined.log'
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
  ],
});

// Create a stream object for Morgan HTTP logging
export const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Define request type
interface RequestContext {
  id?: string;
  method?: string;
  url?: string;
  ip?: string;
}

// Define log context type
interface LogContext {
  [key: string]: unknown;
}

// Add request context logging
export const logRequest = (req: RequestContext, message: string, metadata: LogContext = {}) => {
  logger.info(message, {
    requestId: req.id,
    method: req.method,
    url: req.url,
    ip: req.ip,
    ...metadata,
  });
};

// Add response context logging
export const logResponse = (
  req: RequestContext,
  res: { statusCode: number; responseTime?: number },
  message: string,
  metadata: LogContext = {}
) => {
  logger.info(message, {
    requestId: req.id,
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    responseTime: res.responseTime,
    ...metadata,
  });
};

// Add error context logging
export const logError = (error: Error, req?: RequestContext, metadata: LogContext = {}) => {
  const errorLog: LogContext = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...metadata,
  };

  if (req) {
    errorLog.requestId = req.id;
    errorLog.method = req.method;
    errorLog.url = req.url;
  }

  logger.error('Error occurred', errorLog);
};

export default logger; 