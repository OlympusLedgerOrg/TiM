import { Request, Response, NextFunction } from 'express';

/**
 * Middleware that redirects HTTP requests to HTTPS in production.
 * Checks X-Forwarded-Proto header (set by reverse proxies / load balancers)
 * and the protocol itself.
 */
export function httpsRedirect(req: Request, res: Response, next: NextFunction) {
  // Skip in non-production environments
  if (process.env.NODE_ENV !== 'production') return next();

  // Skip if HTTPS redirect is explicitly disabled (e.g. behind TLS-terminating proxy)
  if (process.env.DISABLE_HTTPS_REDIRECT === 'true') return next();

  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  if (proto !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }

  // Set HSTS header for browsers
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return next();
}
