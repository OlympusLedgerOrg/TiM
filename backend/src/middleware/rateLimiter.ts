import rateLimit from 'express-rate-limit';

/**
 * Global rate limiter — applies to all routes.
 * 100 requests per minute per IP (generous for normal usage).
 */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: Number(process.env.RATE_LIMIT_GLOBAL ?? 100),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});

/**
 * Stricter limiter for SAP integration endpoints.
 * 30 requests per minute per IP — SAP syncs are batch-oriented.
 */
export const sapLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_SAP ?? 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many SAP requests, please try again later.' },
});

/**
 * Auth endpoint limiter to prevent brute-force attacks.
 * 10 requests per minute per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_AUTH ?? 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts, please try again later.' },
});
