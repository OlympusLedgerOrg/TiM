// Ensure JWT secret is set before auth middleware is loaded
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

// Socket emitter mocked before app import
jest.mock('../src/sockets/workOrderSocket', () => ({
  emitStepCompleted: jest.fn(),
  emitQueueUpdated: jest.fn(),
}));

// Prisma mocked BEFORE importing app to avoid real DB calls.
const m: Record<string, any> = {
  workCenter: { findFirst: jest.fn(), findMany: jest.fn() },
  batch: { findFirst: jest.fn(), findMany: jest.fn() },
  workOrder: { findFirst: jest.fn() },
  reservation: { findFirst: jest.fn() },
  inventoryMovement: { aggregate: jest.fn(), create: jest.fn(), update: jest.fn() },
  lot: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  movement: { findMany: jest.fn() },
  $transaction: jest.fn(),
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

describe('Station API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    try { server.close(); } catch (_) {}
  });

  // ─── GET /api/v1/station/work-order ───────────────────────────────────────

  describe('GET /api/v1/station/work-order', () => {
    test('returns 400 without workCenter param', async () => {
      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/station/work-order')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/workCenter/);
    });

    test('returns 404 for unknown work center', async () => {
      m.workCenter.findFirst.mockResolvedValue(null);
      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/station/work-order?workCenter=NOPE')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    test('returns null work order when no active batch', async () => {
      m.workCenter.findFirst.mockResolvedValue({ id: 'wc-1', code: 'MIX-01' });
      m.batch.findFirst.mockResolvedValue(null);

      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/station/work-order?workCenter=MIX-01')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.workOrder).toBeNull();
    });

    test('returns work order with batch when no BOM', async () => {
      m.workCenter.findFirst.mockResolvedValue({ id: 'wc-1', code: 'MIX-01' });
      m.batch.findFirst.mockResolvedValue({
        id: 'batch-1',
        materialId: 'mat-1',
        lotNumber: 'LOT-001',
        status: 'IN_PROGRESS',
        material: { id: 'mat-1', description: 'EPDM Compound 70A' },
      });
      m.workOrder.findFirst.mockResolvedValue(null);

      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/station/work-order?workCenter=MIX-01')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.workOrder).toBeTruthy();
      expect(res.body.workOrder.title).toContain('EPDM Compound 70A');
      expect(res.body.workOrder.components).toEqual([]);
    });

    test('returns 401 without token', async () => {
      const res = await request(app)
        .get('/api/v1/station/work-order?workCenter=MIX-01');
      expect(res.status).toBe(401);
    });
  });

  // ─── GET /api/v1/station/on-hand ──────────────────────────────────────────

  describe('GET /api/v1/station/on-hand', () => {
    test('returns 400 without workCenter param', async () => {
      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/station/on-hand')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    });

    test('returns lots at work center', async () => {
      m.workCenter.findFirst.mockResolvedValue({ id: 'wc-1', code: 'MIX-01' });
      m.batch.findMany.mockResolvedValue([
        {
          id: 'b1',
          lotNumber: 'LOT-001',
          quantity: 500,
          status: 'IN_PROGRESS',
          material: { id: 'mat-1', description: 'EPDM Base Rubber', sapMaterialNumber: 'MAT-7823', unitOfMeasure: 'LB' },
          labReports: [{ result: 'PASS' }],
        },
        {
          id: 'b2',
          lotNumber: 'LOT-002',
          quantity: 50,
          status: 'FLAGGED',
          material: { id: 'mat-2', description: 'Process Oil', sapMaterialNumber: 'MAT-0088', unitOfMeasure: 'GAL' },
          labReports: [{ result: 'FAIL' }],
        },
      ]);

      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/station/on-hand?workCenter=MIX-01')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.lots).toHaveLength(2);
      expect(res.body.lots[0].lotNumber).toBe('LOT-001');
      expect(res.body.lots[0].labResult).toBe('PASS');
      expect(res.body.lots[1].status).toBe('QUARANTINED');
      expect(res.body.lots[1].labResult).toBe('FAIL');
    });

    test('returns 404 for unknown work center', async () => {
      m.workCenter.findFirst.mockResolvedValue(null);
      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/station/on-hand?workCenter=NOPE')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  // ─── GET /api/v1/station/inbound ──────────────────────────────────────────

  describe('GET /api/v1/station/inbound', () => {
    test('returns 400 without workCenter param', async () => {
      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/station/inbound')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    });

    test('returns inbound transfers', async () => {
      m.workCenter.findFirst.mockResolvedValue({ id: 'wc-1', code: 'MIX-01' });
      m.movement.findMany.mockResolvedValue([
        {
          id: 'mov-1',
          quantity: 55,
          movedAt: new Date('2026-04-13T10:00:00Z'),
          batch: {
            lotNumber: 'LOT-031',
            material: { description: 'Zinc Oxide', sapMaterialNumber: 'MAT-0391', unitOfMeasure: 'LB' },
          },
          fromWorkCenter: { name: 'Receiving' },
        },
      ]);

      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/station/inbound?workCenter=MIX-01')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.transfers).toHaveLength(1);
      expect(res.body.transfers[0].lotNumber).toBe('LOT-031');
      expect(res.body.transfers[0].material).toBe('Zinc Oxide');
      expect(res.body.transfers[0].fromStation).toBe('Receiving');
    });
  });

  // ─── POST /api/v1/station/consume ─────────────────────────────────────────

  describe('POST /api/v1/station/consume', () => {
    test('returns 400 for invalid body', async () => {
      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/station/consume')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    test('returns 404 when work order not found', async () => {
      m.workOrder.findFirst.mockResolvedValue(null);

      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/station/consume')
        .set('Authorization', `Bearer ${token}`)
        .send({ workOrderId: 'wo-1', lotId: 'lot-1', quantity: 100 });
      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/work order/i);
    });

    test('returns 404 when lot not found', async () => {
      m.workOrder.findFirst.mockResolvedValue({ id: 'wo-1', status: 'IN_PROGRESS' });
      m.lot.findFirst.mockResolvedValue(null);

      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/station/consume')
        .set('Authorization', `Bearer ${token}`)
        .send({ workOrderId: 'wo-1', lotId: 'lot-1', quantity: 100 });
      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/lot/i);
    });

    test('returns 400 when consuming more than available', async () => {
      m.workOrder.findFirst.mockResolvedValue({ id: 'wo-1', status: 'IN_PROGRESS' });
      m.lot.findFirst.mockResolvedValue({ id: 'lot-1', quantity: 50, status: 'ACTIVE' });

      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/station/consume')
        .set('Authorization', `Bearer ${token}`)
        .send({ workOrderId: 'wo-1', lotId: 'lot-1', quantity: 100 });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Cannot consume/);
    });

    test('successfully consumes material', async () => {
      m.workOrder.findFirst.mockResolvedValue({ id: 'wo-1', status: 'IN_PROGRESS' });
      m.lot.findFirst.mockResolvedValue({ id: 'lot-1', quantity: 500, status: 'ACTIVE' });
      m.$transaction.mockResolvedValue([
        { id: 'mov-1', type: 'CONSUME', quantity: 100, lotId: 'lot-1', workOrderId: 'wo-1' },
        { id: 'lot-1', quantity: 400, status: 'ACTIVE' },
      ]);

      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/station/consume')
        .set('Authorization', `Bearer ${token}`)
        .send({ workOrderId: 'wo-1', lotId: 'lot-1', quantity: 100 });
      expect(res.status).toBe(201);
      expect(res.body.movement).toBeTruthy();
      expect(res.body.remainingQuantity).toBe(400);
    });

    test('returns 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/v1/station/consume');
      expect(res.status).toBe(401);
    });
  });

  // ─── POST /api/v1/station/produce ─────────────────────────────────────────

  describe('POST /api/v1/station/produce', () => {
    test('returns 400 for invalid body', async () => {
      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/station/produce')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    test('returns 404 when work order not found', async () => {
      m.workOrder.findFirst.mockResolvedValue(null);

      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/station/produce')
        .set('Authorization', `Bearer ${token}`)
        .send({ workOrderId: 'wo-1', quantity: 1000, uom: 'LB' });
      expect(res.status).toBe(404);
    });

    test('returns 400 when work order has no output material', async () => {
      m.workOrder.findFirst.mockResolvedValue({
        id: 'wo-1', status: 'IN_PROGRESS', materialId: null,
      });

      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/station/produce')
        .set('Authorization', `Bearer ${token}`)
        .send({ workOrderId: 'wo-1', quantity: 1000, uom: 'LB' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/output material/i);
    });

    test('successfully records production', async () => {
      m.workOrder.findFirst.mockResolvedValue({
        id: 'wo-1', status: 'IN_PROGRESS', materialId: 'mat-1',
        material: { id: 'mat-1', description: 'EPDM Compound 70A' },
      });
      m.$transaction.mockImplementation(async (fn: Function) => {
        return fn({
          lot: {
            create: jest.fn().mockResolvedValue({
              id: 'lot-out-1', materialId: 'mat-1', quantity: 1000, uom: 'LB', status: 'ACTIVE', workOrderId: 'wo-1',
            }),
          },
          inventoryMovement: {
            create: jest.fn().mockResolvedValue({
              id: 'mov-1', type: 'PRODUCE', quantity: 1000, lotId: 'lot-out-1',
            }),
          },
        });
      });

      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/station/produce')
        .set('Authorization', `Bearer ${token}`)
        .send({ workOrderId: 'wo-1', quantity: 1000, uom: 'LB' });
      expect(res.status).toBe(201);
      expect(res.body.lot).toBeTruthy();
      expect(res.body.lot.quantity).toBe(1000);
      expect(res.body.movement.type).toBe('PRODUCE');
    });
  });
});
