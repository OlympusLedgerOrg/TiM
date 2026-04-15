import pinoHttp from 'pino-http';
import { logger } from '../services/logger.js';

/**
 * Structured HTTP request logging via pino-http.
 *
 * Every request logs: method, url, status, response time, request ID.
 * In production, output is JSON for log aggregators (ELK, Datadog, Splunk).
 * In development, inherits the pretty-printed pino-pretty transport.
 *
 * Health-check endpoints are logged at 'silent' level to avoid noise.
 */
export const requestLogger = pinoHttp({
  logger,
  // Use the request ID already set by the requestId middleware
  genReqId: (req) => (req as Express.Request).id ?? 'unknown',
  // Quiet health checks and readiness probes
  autoLogging: {
    ignore: (req) => {
      const url = req.url ?? '';
      return url === '/health' || url.startsWith('/health/');
    },
  },
  customLogLevel: (_req, res, err) => {
    if (err || (res.statusCode >= 500)) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} → ${res.statusCode}`;
  },
  customErrorMessage: (req, _res, err) => {
    return `${req.method} ${req.url} failed: ${err.message}`;
  },
});
