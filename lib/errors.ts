import { NextResponse } from 'next/server';
import { logError } from './logger';

// Standard error types
export type ApiError = {
  code: string;
  message: string;
  details?: any;
  status: number;
  timestamp?: string;
  requestId?: string;
};

// Error classes
export class BaseError extends Error {
  constructor(
    public code: string,
    public message: string,
    public status: number = 500,
    public details?: any,
    public requestId?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): ApiError {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      details: this.details,
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
    };
  }
}

export class ValidationError extends BaseError {
  constructor(message: string, details?: any, requestId?: string) {
    super('VALIDATION_ERROR', message, 400, details, requestId);
  }
}

export class AuthenticationError extends BaseError {
  constructor(message: string = 'Unauthorized', details?: any, requestId?: string) {
    super('AUTHENTICATION_ERROR', message, 401, details, requestId);
  }
}

export class ForbiddenError extends BaseError {
  constructor(message: string = 'Forbidden', details?: any, requestId?: string) {
    super('FORBIDDEN_ERROR', message, 403, details, requestId);
  }
}

export class NotFoundError extends BaseError {
  constructor(message: string, details?: any, requestId?: string) {
    super('NOT_FOUND_ERROR', message, 404, details, requestId);
  }
}

export class DatabaseError extends BaseError {
  constructor(message: string, details?: any, requestId?: string) {
    super('DATABASE_ERROR', message, 500, details, requestId);
  }
}

export class VoiceProcessingError extends BaseError {
  constructor(message: string, details?: any, requestId?: string) {
    super('VOICE_PROCESSING_ERROR', message, 500, details, requestId);
  }
}

export class FileUploadError extends BaseError {
  constructor(message: string, details?: any, requestId?: string) {
    super('FILE_UPLOAD_ERROR', message, 400, details, requestId);
  }
}

export class RateLimitError extends BaseError {
  constructor(message: string = 'Too many requests', details?: any, requestId?: string) {
    super('RATE_LIMIT_ERROR', message, 429, details, requestId);
  }
}

// Error handler function
export function handleApiError(error: unknown, req?: Request): NextResponse {
  const requestId = req?.headers.get('x-request-id') || undefined;
  
  // Log the error with context
  logError(error instanceof Error ? error : new Error(String(error)), req, {
    requestId,
    url: req?.url,
    method: req?.method,
  });

  if (error instanceof BaseError) {
    const errorResponse = error.toJSON();
    return NextResponse.json(
      { error: errorResponse },
      { status: error.status }
    );
  }

  // Handle unknown errors
  const unknownError = error instanceof Error ? error : new Error(String(error));
  const errorResponse: ApiError = {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
    status: 500,
    timestamp: new Date().toISOString(),
    requestId,
    details: process.env.NODE_ENV === 'development' ? {
      message: unknownError.message,
      stack: unknownError.stack,
    } : undefined,
  };

  return NextResponse.json(
    { error: errorResponse },
    { status: 500 }
  );
}

// Helper function to determine if an error is a known API error
export function isApiError(error: unknown): error is BaseError {
  return error instanceof BaseError;
}

// Helper function to create error from status code
export function createErrorFromStatus(
  status: number,
  message?: string,
  details?: any,
  requestId?: string
): BaseError {
  switch (status) {
    case 400:
      return new ValidationError(message || 'Bad Request', details, requestId);
    case 401:
      return new AuthenticationError(message, details, requestId);
    case 403:
      return new ForbiddenError(message, details, requestId);
    case 404:
      return new NotFoundError(message || 'Not Found', details, requestId);
    case 429:
      return new RateLimitError(message, details, requestId);
    default:
      return new BaseError('INTERNAL_SERVER_ERROR', message || 'Internal Server Error', 500, details, requestId);
  }
}

// Logger utility
export const logger = {
  error: (message: string, error: unknown, context?: any) => {
    console.error(message, {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error,
      context,
      timestamp: new Date().toISOString()
    });
  },
  warn: (message: string, context?: any) => {
    console.warn(message, {
      context,
      timestamp: new Date().toISOString()
    });
  },
  info: (message: string, context?: any) => {
    console.info(message, {
      context,
      timestamp: new Date().toISOString()
    });
  },
  debug: (message: string, context?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(message, {
        context,
        timestamp: new Date().toISOString()
      });
    }
  }
}; 