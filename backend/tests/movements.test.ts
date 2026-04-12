// Ensure JWT secret is set before auth middleware is loaded
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

// Socket emitter mocked before app import
jest.mock('../src/sockets/workOrderSocket', () => ({
  emitStepCompleted: jest.fn(),
  emitQueueUpdated: jest.fn(),
}));

// Mock Olympus bridge
jest.mock('../src/services/olympusBridge', () => ({
  commitToOlympus: jest.fn().mockResolvedValue('commit-abc'),
}));

// Prisma mocked BEFORE importing app to avoid real DB calls.
const m = {
  batch: { findFirst: jest.fn(), update: jest.fn() },
  movement: { create: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};
jest.mock('../src/prisma/client', () => ({ prisma: m }));

import request from 'supertest';
import { app, server } from '../src/app';
import { SignJWT } from 'jose';

async function makeToken(role: 'Tech' | 'Supervisor' | 'Admin', tenantId = 'default') {
  const key = new TextEncoder().encode(process.env.JWT_SECRET!);
  return new SignJWT({ sub: 'user-1', role, tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
}

const validBody = {
  batchId: 'batch-1',
  fromWorkCenterId: 'wc-1',
  toWorkCenterId: 'wc-2',
  quantity: 500,
  notes: 'Moving batch',
};

describe('POST /api/v1/movements', () => {
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => { try { server.close(); } catch (_) {} });

  test('returns 401 without token', async () => {
    const res = await request(app).post('/api/v1/movements').send(validBody);
    expect(res.status).toBe(401);
  });

  test('returns 400 with invalid body', async () => {
    const token = await makeToken('Tech');
    const res = await request(app)
      .post('/api/v1/movements')
      .set('Authorization', `Bearer ${token}`)
      .send({ batchId: '' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when quantity is negative', async () => {
    const token = await makeToken('Tech');
    const res = await request(app)
      .post('/api/v1/movements')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validBody, quantity: -10 });
    expect(res.status).toBe(400);
  });

  test('returns 404 when batch not found', async () => {
    m.batch.findFirst.mockResolvedValue(null);
    const token = await makeToken('Tech');
    const res = await request(app)
      .post('/api/v1/movements')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody);
    expect(res.status).toBe(404);
  });

  test('returns 201 on success', async () => {
    const now = new Date();
    m.batch.findFirst.mockResolvedValue({ id: 'batch-1', lotNumber: 'LOT-001' });
    m.$transaction.mockResolvedValue([
      {
        id: 'mv-1',
        batchId: 'batch-1',
        fromWorkCenterId: 'wc-1',
        toWorkCenterId: 'wc-2',
        quantity: 500,
        movedByUserId: 'user-1',
        movedAt: now,
        olympusCommitId: null,
      },
    ]);
    const token = await makeToken('Tech');
    const res = await request(app)
      .post('/api/v1/movements')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('movement');
    expect(res.body.movement).toHaveProperty('id', 'mv-1');
  });
});
