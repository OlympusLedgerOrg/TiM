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
  labReport: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  signoff: { create: jest.fn() },
  olympusCommit: { upsert: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};
// Interactive transaction: run the callback against the same mock client.
// Set after the literal so `m` does not reference itself in its own initializer.
m.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(m));
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

describe('POST /api/v1/lab-reports', () => {
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => { try { server.close(); } catch (_) {} });

  const validBody = {
    batchId: 'batch-1',
    fileHash: 'a'.repeat(64),
    fileUrl: 'https://example.com/report.pdf',
    fileName: 'report.pdf',
    result: 'PASS',
  };

  test('returns 401 without token', async () => {
    const res = await request(app).post('/api/v1/lab-reports').send(validBody);
    expect(res.status).toBe(401);
  });

  test('returns 400 with invalid body', async () => {
    const token = await makeToken('Tech');
    const res = await request(app)
      .post('/api/v1/lab-reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ batchId: '' });
    expect(res.status).toBe(400);
  });

  test('returns 404 when batch not found', async () => {
    m.batch.findFirst.mockResolvedValue(null);
    const token = await makeToken('Tech');
    const res = await request(app)
      .post('/api/v1/lab-reports')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody);
    expect(res.status).toBe(404);
  });

  test('returns 201 on success', async () => {
    const now = new Date();
    m.batch.findFirst.mockResolvedValue({ id: 'batch-1', lotNumber: 'LOT-001' });
    m.labReport.create.mockResolvedValue({
      id: 'lr-1',
      batchId: 'batch-1',
      fileHash: validBody.fileHash,
      submittedAt: now,
    });
    const token = await makeToken('Tech');
    const res = await request(app)
      .post('/api/v1/lab-reports')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('report');
  });

  test('flags batch when result is FAIL', async () => {
    const now = new Date();
    m.batch.findFirst.mockResolvedValue({ id: 'batch-1', lotNumber: 'LOT-001' });
    m.labReport.create.mockResolvedValue({
      id: 'lr-2',
      batchId: 'batch-1',
      fileHash: validBody.fileHash,
      submittedAt: now,
    });
    m.batch.update.mockResolvedValue({ id: 'batch-1', status: 'FLAGGED' });
    const token = await makeToken('Tech');
    const res = await request(app)
      .post('/api/v1/lab-reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validBody, result: 'FAIL' });
    expect(res.status).toBe(201);
    expect(m.batch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: { status: 'FLAGGED' },
    });
  });

  test('enqueues the Olympus anchor inside the report transaction', async () => {
    m.batch.findFirst.mockResolvedValue({ id: 'batch-1', lotNumber: 'LOT-001' });
    m.labReport.create.mockResolvedValue({
      id: 'lr-1',
      batchId: 'batch-1',
      fileHash: validBody.fileHash,
      submittedAt: new Date(),
    });
    const token = await makeToken('Tech');
    await request(app)
      .post('/api/v1/lab-reports')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody);

    expect(enqueueOlympusCommit).toHaveBeenCalledTimes(1);
    const [txClient, anchor] = (enqueueOlympusCommit as jest.Mock).mock.calls[0];
    expect(txClient).toBe(m);
    expect(anchor).toMatchObject({
      type: 'LAB_REPORT',
      recordId: 'lr-1',
      data: expect.objectContaining({ fileHash: validBody.fileHash, lotNumber: 'LOT-001' }),
    });
  });

  test('does not enqueue an anchor when the batch is missing', async () => {
    m.batch.findFirst.mockResolvedValue(null);
    const token = await makeToken('Tech');
    const res = await request(app)
      .post('/api/v1/lab-reports')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody);

    expect(res.status).toBe(404);
    expect(enqueueOlympusCommit).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/lab-reports/:reportId/signoff', () => {
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => { try { server.close(); } catch (_) {} });

  test('returns 401 without token', async () => {
    const res = await request(app).post('/api/v1/lab-reports/lr-1/signoff').send({});
    expect(res.status).toBe(401);
  });

  test('returns 403 for Tech role', async () => {
    const token = await makeToken('Tech');
    const res = await request(app)
      .post('/api/v1/lab-reports/lr-1/signoff')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });

  test('returns 404 when report not found', async () => {
    m.labReport.findFirst.mockResolvedValue(null);
    const token = await makeToken('Supervisor');
    const res = await request(app)
      .post('/api/v1/lab-reports/lr-1/signoff')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(404);
  });

  test('returns 409 when already signed off', async () => {
    m.labReport.findFirst.mockResolvedValue({
      id: 'lr-1',
      signoff: { id: 's-1' },
      batch: { lotNumber: 'LOT-001' },
    });
    const token = await makeToken('Supervisor');
    const res = await request(app)
      .post('/api/v1/lab-reports/lr-1/signoff')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(409);
  });

  test('returns 201 on success', async () => {
    const now = new Date();
    m.labReport.findFirst.mockResolvedValue({
      id: 'lr-1',
      signoff: null,
      batchId: 'batch-1',
      fileHash: 'a'.repeat(64),
      result: 'PASS',
      batch: { lotNumber: 'LOT-001' },
    });
    m.signoff.create.mockResolvedValue({
      id: 's-1',
      labReportId: 'lr-1',
      managerId: 'user-1',
      signedAt: now,
    });
    const token = await makeToken('Supervisor');
    const res = await request(app)
      .post('/api/v1/lab-reports/lr-1/signoff')
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Approved' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('signoff');
  });

  test('enqueues the Olympus anchor inside the signoff transaction', async () => {
    m.labReport.findFirst.mockResolvedValue({
      id: 'lr-1',
      signoff: null,
      batchId: 'batch-1',
      fileHash: 'a'.repeat(64),
      result: 'PASS',
      batch: { lotNumber: 'LOT-001' },
    });
    m.signoff.create.mockResolvedValue({
      id: 's-1',
      labReportId: 'lr-1',
      managerId: 'user-1',
      signedAt: new Date(),
    });
    const token = await makeToken('Supervisor');
    await request(app)
      .post('/api/v1/lab-reports/lr-1/signoff')
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Approved' });

    expect(enqueueOlympusCommit).toHaveBeenCalledTimes(1);
    const [txClient, anchor] = (enqueueOlympusCommit as jest.Mock).mock.calls[0];
    expect(txClient).toBe(m);
    expect(anchor).toMatchObject({
      type: 'SIGNOFF',
      recordId: 's-1',
      data: expect.objectContaining({ labReportId: 'lr-1', lotNumber: 'LOT-001' }),
    });
  });

  test('does not enqueue an anchor when the report is already signed off', async () => {
    m.labReport.findFirst.mockResolvedValue({
      id: 'lr-1',
      signoff: { id: 's-1' },
      batch: { lotNumber: 'LOT-001' },
    });
    const token = await makeToken('Supervisor');
    const res = await request(app)
      .post('/api/v1/lab-reports/lr-1/signoff')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(409);
    expect(enqueueOlympusCommit).not.toHaveBeenCalled();
  });
});
