import cors from 'cors';

/**
 * CORS configuration for the REST API.
 *
 * In production the CORS_ORIGIN env var must be set to a comma-separated
 * list of allowed origins (e.g. "https://tim.example.com,https://admin.example.com").
 *
 * In development / test any origin is permitted.
 */
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : [];

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);

    // In non-production environments with no explicit config, allow everything
    if (process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  exposedHeaders: ['X-Request-ID'],
});
