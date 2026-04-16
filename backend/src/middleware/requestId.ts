import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Generates or propagates a unique request ID for every HTTP request.
 * If the client sends an X-Request-ID header, it is re-used for correlation.
 * Otherwise a new UUID v4 is generated.
 *
 * The ID is attached to `req.id` and echoed back in the response header.
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const id =
    (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id']) ||
    randomUUID();

  (req as Request & { id: string }).id = id;
  res.setHeader('X-Request-ID', id);
  next();
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}
