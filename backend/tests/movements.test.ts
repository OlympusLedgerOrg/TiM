// Ensure JWT secret is set before auth middleware is loaded
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

// Socket emitter mocked before app import
jest.mock('../src/sockets/workOrderSocket', () => ({
  emitStepCompleted: jest.fn(),
  emitQueueUpdated: jest.fn(),
}));

// Mock the Olympus outbox — the enqueue itself is covered by
// tests/olympusOutbox.test.ts; here we only care about the HTTP behaviour.
jest.mock('../src/services/olympusOutbox', () => ({
  enqueueOlympusCommit: jest.fn().mockResolvedValue(undefined),
  startOlympusDrainer: jest.fn(),
}));
jest.mock('../src/services/olympusBridge', () => ({
  isOlympusEnabled: jest.fn().mockReturnValue(false),
}));

// Prisma mocked BEFORE importing app to avoid real DB calls.
const m = {
  batch: { findFirst: jest.fn(), update: jest.fn() },
  movement: { create: jest.fn(), update: jest.fn() },
  olympusCommit: { upsert: jest.fn() },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};
jest.mock('../src/prisma/client', () => ({ prisma: m }));

import request from 'supertest';
import { app, server } from '../src/app';
import { SignJWT } from 'jose';
import { enqueueOlympusCommit } from '../src/services/olympusOutbox';

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

  function stubSuccessfulMovement() {
    const now = new Date();
    m.batch.findFirst.mockResolvedValue({ id: 'batch-1', lotNumber: 'LOT-001' });
    m.movement.create.mockResolvedValue({
      id: 'mv-1',
      batchId: 'batch-1',
      fromWorkCenterId: 'wc-1',
      toWorkCenterId: 'wc-2',
      quantity: 500,
      movedByUserId: 'user-1',
      movedAt: now,
      olympusCommitId: null,
    });
    m.batch.update.mockResolvedValue({ id: 'batch-1' });
    // Interactive transaction: run the callback against the same mock client.
    m.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(m));
  }

  test('returns 201 on success', async () => {
    stubSuccessfulMovement();
    const token = await makeToken('Tech');
    const res = await request(app)
      .post('/api/v1/movements')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('movement');
    expect(res.body.movement).toHaveProperty('id', 'mv-1');
  });

  // The whole point of the outbox: the anchor is enqueued with the same client
  // the movement was written through, so both commit or neither does.
  test('enqueues the Olympus anchor inside the movement transaction', async () => {
    stubSuccessfulMovement();
    const token = await makeToken('Tech');
    await request(app)
      .post('/api/v1/movements')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody);

    expect(enqueueOlympusCommit).toHaveBeenCalledTimes(1);
    const [txClient, anchor] = (enqueueOlympusCommit as jest.Mock).mock.calls[0];
    expect(txClient).toBe(m);
    expect(anchor).toMatchObject({
      type: 'MOVEMENT',
      tenantId: 'default',
      recordId: 'mv-1',
      data: expect.objectContaining({ batchId: 'batch-1', lotNumber: 'LOT-001', quantity: 500 }),
    });
  });

  test('does not enqueue an anchor when the batch is missing', async () => {
    m.batch.findFirst.mockResolvedValue(null);
    const token = await makeToken('Tech');
    const res = await request(app)
      .post('/api/v1/movements')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody);

    expect(res.status).toBe(404);
    expect(enqueueOlympusCommit).not.toHaveBeenCalled();
  });
});
