import { jwtVerify } from 'jose';
import { NextFunction, Request, Response } from 'express';

export type Role = 'Tech' | 'Supervisor' | 'Admin';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role; tenantId: string };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return res.status(401).json({ message: 'Missing token' });

    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'change-me');
    const { payload } = await jwtVerify(token, secret);
    req.user = {
      id: String(payload.sub),
      role: payload.role as Role,
      tenantId: String(payload.tenantId ?? 'default'),
    };
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
