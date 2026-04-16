import pino from 'pino';

/**
 * Structured logger — replaces console.log throughout the app.
 *
 * In production, outputs JSON for log aggregators (ELK, Datadog, etc.).
 * In development, uses pino-pretty for human-readable output.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
  base: { service: 'tim-backend' },
  serializers: {
    err: pino.stdSerializers.err,
    req: (req) => ({
      method: req.method,
      url: req.url,
      remoteAddress: req.socket?.remoteAddress,
    }),
  },
});
