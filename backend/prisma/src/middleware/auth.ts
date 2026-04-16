import { jwtVerify } from 'jose';
import { NextFunction, Request, Response } from 'express';
import { getJwtSecret } from '../../../src/config/jwt.js';

export type Role = 'Tech' | 'Supervisor' | 'Admin';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return res.status(401).json({ message: 'Missing token' });

    const { payload } = await jwtVerify(token, getJwtSecret());
    req.user = { id: String(payload.sub), role: payload.role as Role };
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

export function requireRole(roles: Role[]) {
  return (req: any, res: any, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}
