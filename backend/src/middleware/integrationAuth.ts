import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireCallGuardKey(req: Request, res: Response, next: NextFunction) {
  const configuredKey = process.env.CALLGUARD_INTEGRATION_KEY;
  if (!configuredKey || configuredKey === 'change-me') {
    return res.status(503).json({
      message: 'Call Guard integration is not configured',
      code: 'CALLGUARD_NOT_CONFIGURED',
    });
  }

  const providedKey = req.header('x-callguard-key') ?? '';
  if (!providedKey || !safeEqual(providedKey, configuredKey)) {
    return res.status(401).json({
      message: 'Invalid Call Guard integration key',
      code: 'INVALID_INTEGRATION_KEY',
    });
  }

  return next();
}
