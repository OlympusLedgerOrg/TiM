// Mock prisma BEFORE importing app so no real connection occurs
jest.mock('../src/prisma/client', () => {
  return { prisma: { $queryRaw: jest.fn() } };
});

import request from 'supertest';
import { app, server } from '../src/app';
import { prisma } from '../src/prisma/client';

describe('GET /health', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 503 when DB probe fails', async () => {
    (prisma.$queryRaw as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('status');
    expect(res.body.database).toHaveProperty('connected', false);
  });

  test('returns 200 when DB is healthy', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ '?column?': 1 }]);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body.database).toHaveProperty('connected', true);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    try { server.close(); } catch (_) {}
  });
});
