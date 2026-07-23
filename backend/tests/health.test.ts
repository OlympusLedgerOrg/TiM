// Mock prisma BEFORE importing app so no real connection occurs
jest.mock('../src/prisma/client', () => {
  return { prisma: { $queryRaw: jest.fn() } };
});

import request from 'supertest';
import { app, server } from '../src/app';
import { prisma } from '../src/prisma/client';
import { incrementErrorCount, incrementRequestCount } from '../src/routes/health';

describe('health, readiness, and metrics endpoints', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 503 when the liveness DB probe fails', async () => {
    (prisma.$queryRaw as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      status: 'unhealthy',
      database: { connected: false, error: 'db down' },
      service: 'TiM Backend API',
      version: '1.0.0',
    });
    expect(res.body.database.responseTime).toMatch(/^\d+ms$/);
  });

  test('does not leak non-Error liveness failures', async () => {
    (prisma.$queryRaw as jest.Mock).mockRejectedValueOnce('connection refused');
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.database.error).toBe('Unknown error');
  });

  test('returns 200 when the liveness DB probe is healthy', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ '?column?': 1 }]);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'healthy',
      database: { connected: true },
      service: 'TiM Backend API',
      version: '1.0.0',
    });
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.database.responseTime).toMatch(/^\d+ms$/);
  });

  test('returns readiness details for the database and Socket.IO', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ '?column?': 1 }]);
    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.checks.database.status).toBe('ok');
    expect(res.body.checks.database.latencyMs).toEqual(expect.any(Number));
    expect(res.body.checks.socketio).toMatchObject({
      status: 'ok',
      details: {
        connectedClients: expect.any(Number),
        path: expect.any(String),
      },
    });
  });

  test('fails readiness when a dependency is unavailable', async () => {
    (prisma.$queryRaw as jest.Mock).mockRejectedValueOnce(new Error('database unavailable'));
    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
    expect(res.body.checks.database).toMatchObject({
      status: 'error',
      error: 'database unavailable',
    });
  });

  test('publishes process metrics and request/error counters', async () => {
    incrementRequestCount();
    incrementRequestCount();
    incrementErrorCount();

    const res = await request(app).get('/health/metrics');
    expect(res.status).toBe(200);
    expect(res.body.memory).toEqual(expect.objectContaining({
      rss: expect.any(Number),
      heapUsed: expect.any(Number),
      heapTotal: expect.any(Number),
      external: expect.any(Number),
    }));
    expect(res.body.requests.total).toBeGreaterThanOrEqual(2);
    expect(res.body.requests.errors).toBeGreaterThanOrEqual(1);
    expect(res.body.requests.errorRate).toEqual(expect.any(Number));
    expect(res.body.process).toEqual(expect.objectContaining({
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
    }));
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    try { server.close(); } catch (_) {}
  });
});
