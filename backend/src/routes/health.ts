import { Router, Request, Response } from 'express';
import { prisma } from '../prisma/client.js';
import { io } from '../app.js';

const router = Router();

/**
 * Health check endpoint with dependency checks.
 * GET /health — quick liveness probe
 * GET /health/ready — full readiness probe (DB + Socket.IO)
 * GET /health/metrics — basic APM metrics (uptime, memory, request count)
 */

let requestCount = 0;
let errorCount = 0;

// Track requests for metrics
export function incrementRequestCount() { requestCount++; }
export function incrementErrorCount() { errorCount++; }

router.get('/', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;
    
    const responseTime = Date.now() - startTime;
    
    return res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        connected: true,
        responseTime: `${responseTime}ms`
      },
      service: 'TiM Backend API',
      version: '1.0.0'
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        connected: false,
        responseTime: `${responseTime}ms`,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      service: 'TiM Backend API',
      version: '1.0.0'
    });
  }
});

// ─── Readiness Probe ──────────────────────────────────────────────────────────

router.get('/ready', async (req: Request, res: Response) => {
  const checks: Record<string, { status: string; latencyMs?: number; error?: string; details?: Record<string, unknown> }> = {};

  // Database check
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
  } catch (error) {
    checks.database = {
      status: 'error',
      latencyMs: Date.now() - dbStart,
      error: error instanceof Error ? error.message : 'Unknown',
    };
  }

  // Socket.IO check
  try {
    const connectedSockets = io.engine?.clientsCount ?? 0;
    checks.socketio = {
      status: 'ok',
      details: {
        connectedClients: connectedSockets,
        path: io.path(),
      },
    };
  } catch (error) {
    checks.socketio = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown',
    };
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok');

  return res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks,
  });
});

// ─── Metrics Endpoint ─────────────────────────────────────────────────────────

router.get('/metrics', (req: Request, res: Response) => {
  const mem = process.memoryUsage();

  return res.status(200).json({
    uptime: Math.round(process.uptime()),
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),     // MB
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      external: Math.round(mem.external / 1024 / 1024),
    },
    requests: {
      total: requestCount,
      errors: errorCount,
      errorRate: requestCount > 0 ? Math.round((errorCount / requestCount) * 10000) / 100 : 0,
    },
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
