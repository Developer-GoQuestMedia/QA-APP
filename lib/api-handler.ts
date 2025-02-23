import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { rateLimit } from './rate-limit';

interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

type ApiHandler = (
  req: NextApiRequest,
  res: NextApiResponse,
  session?: Session | null
) => Promise<void> | void;

export type ApiMiddleware = (handler: ApiHandler) => ApiHandler;

export const withErrorHandler = (handler: ApiHandler) => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      const session = await getServerSession(authOptions);
      await handler(req, res, session);
    } catch (error) {
      console.error('API Error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };
};

export const withAuth = (handler: ApiHandler): ApiHandler => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    return handler(req, res, session);
  };
};

export const createApiHandler = (
  handler: ApiHandler,
  options: {
    requireAuth?: boolean;
    requiredRole?: string;
  } = {}
): ApiHandler => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // Rate limiting
      const rateLimitResult = await rateLimit(req);
      if (!rateLimitResult.success) {
        return res.status(429).json({ error: 'Too many requests' });
      }

     
      // Authentication check
      if (options.requireAuth) {
        const session = await getServerSession(authOptions);
        if (!session) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        // Role check
        if (options.requiredRole && session.user?.role !== options.requiredRole) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }

      await handler(req, res);
    } catch (error) {
      const apiError = error as ApiError;
      console.error('API Error:', {
        path: req.url,
        error: apiError.message,
        stack: process.env.NODE_ENV === 'development' ? apiError.stack : undefined
      });

      const statusCode = apiError.statusCode || 500;
      res.status(statusCode).json({
        error: apiError.code || 'internal_server_error',
        message: process.env.NODE_ENV === 'development' ? apiError.message : 'Internal server error'
      });
    }
  };
}; 