// Ensure JWT secret is set before auth middleware is loaded
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

// Socket emitter mocked before app import
jest.mock('../src/sockets/workOrderSocket', () => ({
  emitStepCompleted: jest.fn(),
  emitQueueUpdated: jest.fn(),
}));

// Prisma mocked BEFORE importing app to avoid real DB calls.
const mockPrisma: Record<string, any> = {
  lot: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
  },
  reservation: {
    aggregate: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  inventoryMovement: {
    create: jest.fn(),
    aggregate: jest.fn(),
  },
  workCenter: { findFirst: jest.fn(), findMany: jest.fn() },
  batch: { findFirst: jest.fn(), findMany: jest.fn() },
  workOrder: { findFirst: jest.fn() },
  movement: { findMany: jest.fn() },
  $transaction: jest.fn(),
  $queryRawUnsafe: jest.fn(),
};
jest.mock('../src/prisma/client', () => ({ prisma: mockPrisma }));

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

describe('Allocation API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    try { server.close(); } catch { /* cleanup errors intentionally ignored */ }
  });

  // ─── POST /api/v1/allocation/allocate ─────────────────────────────────────

  describe('POST /api/v1/allocation/allocate', () => {
    test('returns 400 for invalid body', async () => {
      const token = await makeToken('Supervisor');
      const res = await request(app)
        .post('/api/v1/allocation/allocate')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Invalid body/);
    });

    test('returns 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/v1/allocation/allocate');
      expect(res.status).toBe(401);
    });

    test('returns 403 for Tech role', async () => {
      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/allocation/allocate')
        .set('Authorization', `Bearer ${token}`)
        .send({ materialId: 'mat-1', requiredQty: 100, strategy: 'FIFO', workOrderId: 'wo-1' });
      expect(res.status).toBe(403);
    });

    test('successfully allocates from a single lot (FIFO)', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          $queryRawUnsafe: jest.fn(),
          lot: {
            findMany: jest.fn().mockResolvedValue([
              { id: 'lot-1', materialId: 'mat-1', quantity: 500, status: 'ACTIVE', createdAt: new Date('2026-01-01') },
            ]),
            findUnique: jest.fn().mockResolvedValue({ id: 'lot-1', quantity: 500 }),
          },
          reservation: {
            aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
            create: jest.fn().mockResolvedValue({ id: 'res-1', lotId: 'lot-1', quantity: 100, status: 'ACTIVE' }),
          },
        };
        return fn(tx);
      });

      const token = await makeToken('Supervisor');
      const res = await request(app)
        .post('/api/v1/allocation/allocate')
        .set('Authorization', `Bearer ${token}`)
        .send({ materialId: 'mat-1', requiredQty: 100, strategy: 'FIFO', workOrderId: 'wo-1' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.allocated).toHaveLength(1);
      expect(res.body.allocated[0].lotId).toBe('lot-1');
      expect(res.body.allocated[0].reserved).toBe(100);
      expect(res.body.shortage).toBe(0);
    });

    test('allocates across multiple lots (partial consumption)', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        let callCount = 0;
        const tx = {
          $queryRawUnsafe: jest.fn(),
          lot: {
            findMany: jest.fn().mockResolvedValue([
              { id: 'lot-1', materialId: 'mat-1', quantity: 60, status: 'ACTIVE', createdAt: new Date('2026-01-01') },
              { id: 'lot-2', materialId: 'mat-1', quantity: 80, status: 'ACTIVE', createdAt: new Date('2026-01-02') },
            ]),
            findUnique: jest.fn().mockImplementation(({ where }: any) => {
              if (where.id === 'lot-1') return Promise.resolve({ id: 'lot-1', quantity: 60 });
              return Promise.resolve({ id: 'lot-2', quantity: 80 });
            }),
          },
          reservation: {
            aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
            create: jest.fn().mockImplementation(({ data }: any) => {
              callCount++;
              return Promise.resolve({ id: `res-${callCount}`, ...data });
            }),
          },
        };
        return fn(tx);
      });

      const token = await makeToken('Admin');
      const res = await request(app)
        .post('/api/v1/allocation/allocate')
        .set('Authorization', `Bearer ${token}`)
        .send({ materialId: 'mat-1', requiredQty: 100, strategy: 'FIFO', workOrderId: 'wo-1' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.allocated).toHaveLength(2);
      expect(res.body.allocated[0]).toEqual({ lotId: 'lot-1', reserved: 60 });
      expect(res.body.allocated[1]).toEqual({ lotId: 'lot-2', reserved: 40 });
    });

    test('returns shortage when insufficient material', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          $queryRawUnsafe: jest.fn(),
          lot: {
            findMany: jest.fn().mockResolvedValue([
              { id: 'lot-1', materialId: 'mat-1', quantity: 30, status: 'ACTIVE', createdAt: new Date() },
            ]),
            findUnique: jest.fn().mockResolvedValue({ id: 'lot-1', quantity: 30 }),
          },
          reservation: {
            aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
            create: jest.fn().mockResolvedValue({ id: 'res-1', lotId: 'lot-1', quantity: 30, status: 'ACTIVE' }),
          },
        };
        return fn(tx);
      });

      const token = await makeToken('Supervisor');
      const res = await request(app)
        .post('/api/v1/allocation/allocate')
        .set('Authorization', `Bearer ${token}`)
        .send({ materialId: 'mat-1', requiredQty: 100, strategy: 'FIFO', workOrderId: 'wo-1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.shortage).toBe(70);
      expect(res.body.allocated).toHaveLength(1);
    });

    test('skips lots with no available quantity (already reserved)', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          $queryRawUnsafe: jest.fn(),
          lot: {
            findMany: jest.fn().mockResolvedValue([
              { id: 'lot-1', materialId: 'mat-1', quantity: 100, status: 'ACTIVE', createdAt: new Date('2026-01-01') },
              { id: 'lot-2', materialId: 'mat-1', quantity: 200, status: 'ACTIVE', createdAt: new Date('2026-01-02') },
            ]),
            findUnique: jest.fn().mockImplementation(({ where }: any) => {
              if (where.id === 'lot-1') return Promise.resolve({ id: 'lot-1', quantity: 100 });
              return Promise.resolve({ id: 'lot-2', quantity: 200 });
            }),
          },
          reservation: {
            aggregate: jest.fn().mockImplementation(({ where }: any) => {
              // lot-1 is fully reserved
              if (where.lotId === 'lot-1') return Promise.resolve({ _sum: { quantity: 100 } });
              return Promise.resolve({ _sum: { quantity: 0 } });
            }),
            create: jest.fn().mockResolvedValue({ id: 'res-1', lotId: 'lot-2', quantity: 50, status: 'ACTIVE' }),
          },
        };
        return fn(tx);
      });

      const token = await makeToken('Admin');
      const res = await request(app)
        .post('/api/v1/allocation/allocate')
        .set('Authorization', `Bearer ${token}`)
        .send({ materialId: 'mat-1', requiredQty: 50, strategy: 'FIFO', workOrderId: 'wo-1' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.allocated).toHaveLength(1);
      expect(res.body.allocated[0].lotId).toBe('lot-2');
    });

    test('FEFO strategy allocates from soonest-expiring lot first', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        let callCount = 0;
        const tx = {
          $queryRawUnsafe: jest.fn(),
          lot: {
            findMany: jest.fn().mockResolvedValue([
              { id: 'lot-exp-soon', materialId: 'mat-1', quantity: 50, status: 'ACTIVE', expiryDate: new Date('2026-05-01'), createdAt: new Date('2026-01-02') },
              { id: 'lot-exp-later', materialId: 'mat-1', quantity: 100, status: 'ACTIVE', expiryDate: new Date('2026-12-01'), createdAt: new Date('2026-01-01') },
            ]),
            findUnique: jest.fn().mockImplementation(({ where }: any) => {
              if (where.id === 'lot-exp-soon') return Promise.resolve({ id: 'lot-exp-soon', quantity: 50 });
              return Promise.resolve({ id: 'lot-exp-later', quantity: 100 });
            }),
          },
          reservation: {
            aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
            create: jest.fn().mockImplementation(({ data }: any) => {
              callCount++;
              return Promise.resolve({ id: `res-${callCount}`, ...data });
            }),
          },
        };
        return fn(tx);
      });

      const token = await makeToken('Admin');
      const res = await request(app)
        .post('/api/v1/allocation/allocate')
        .set('Authorization', `Bearer ${token}`)
        .send({ materialId: 'mat-1', requiredQty: 75, strategy: 'FEFO', workOrderId: 'wo-1' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.allocated).toHaveLength(2);
      // First lot should be the soonest-expiring one
      expect(res.body.allocated[0].lotId).toBe('lot-exp-soon');
      expect(res.body.allocated[0].reserved).toBe(50);
      expect(res.body.allocated[1].lotId).toBe('lot-exp-later');
      expect(res.body.allocated[1].reserved).toBe(25);
    });

    test('returns shortage when no lots exist', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          $queryRawUnsafe: jest.fn(),
          lot: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
          reservation: { aggregate: jest.fn(), create: jest.fn() },
        };
        return fn(tx);
      });

      const token = await makeToken('Supervisor');
      const res = await request(app)
        .post('/api/v1/allocation/allocate')
        .set('Authorization', `Bearer ${token}`)
        .send({ materialId: 'mat-1', requiredQty: 100, strategy: 'FIFO', workOrderId: 'wo-1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.shortage).toBe(100);
      expect(res.body.allocated).toEqual([]);
    });
  });

  // ─── POST /api/v1/allocation/consume ──────────────────────────────────────

  describe('POST /api/v1/allocation/consume', () => {
    test('returns 400 for invalid body', async () => {
      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/allocation/consume')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    test('returns 404 for non-existent reservation', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          reservation: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
          lot: { update: jest.fn() },
          inventoryMovement: { create: jest.fn() },
        };
        return fn(tx);
      });

      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/allocation/consume')
        .set('Authorization', `Bearer ${token}`)
        .send({ reservationId: 'nonexistent' });
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    test('returns 404 for already consumed reservation', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          reservation: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'res-1', lotId: 'lot-1', workOrderId: 'wo-1', quantity: 100, status: 'CONSUMED',
            }),
            update: jest.fn(),
          },
          lot: { update: jest.fn() },
          inventoryMovement: { create: jest.fn() },
        };
        return fn(tx);
      });

      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/allocation/consume')
        .set('Authorization', `Bearer ${token}`)
        .send({ reservationId: 'res-1' });
      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/CONSUMED/);
    });

    test('successfully consumes reservation and deducts from lot', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          reservation: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'res-1', lotId: 'lot-1', workOrderId: 'wo-1', quantity: 100, status: 'ACTIVE',
            }),
            update: jest.fn().mockResolvedValue({ id: 'res-1', status: 'CONSUMED' }),
          },
          lot: {
            update: jest.fn().mockResolvedValue({ id: 'lot-1', quantity: 400, status: 'ACTIVE' }),
          },
          inventoryMovement: {
            create: jest.fn().mockResolvedValue({
              id: 'mov-1', type: 'CONSUME', quantity: 100, lotId: 'lot-1', workOrderId: 'wo-1',
            }),
          },
        };
        return fn(tx);
      });

      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/allocation/consume')
        .set('Authorization', `Bearer ${token}`)
        .send({ reservationId: 'res-1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.movement).toBeTruthy();
      expect(res.body.movement.type).toBe('CONSUME');
      expect(res.body.movement.quantity).toBe(100);
    });

    test('returns 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/v1/allocation/consume');
      expect(res.status).toBe(401);
    });
  });

  // ─── POST /api/v1/allocation/release ──────────────────────────────────────

  describe('POST /api/v1/allocation/release', () => {
    test('returns 400 for invalid body', async () => {
      const token = await makeToken('Supervisor');
      const res = await request(app)
        .post('/api/v1/allocation/release')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    test('returns 404 for non-existent reservation', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          reservation: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
        };
        return fn(tx);
      });

      const token = await makeToken('Supervisor');
      const res = await request(app)
        .post('/api/v1/allocation/release')
        .set('Authorization', `Bearer ${token}`)
        .send({ reservationId: 'nonexistent' });
      expect(res.status).toBe(404);
    });

    test('successfully releases a reservation', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          reservation: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'res-1', lotId: 'lot-1', workOrderId: 'wo-1', quantity: 100, status: 'ACTIVE',
            }),
            update: jest.fn().mockResolvedValue({ id: 'res-1', status: 'CANCELLED' }),
          },
        };
        return fn(tx);
      });

      const token = await makeToken('Supervisor');
      const res = await request(app)
        .post('/api/v1/allocation/release')
        .set('Authorization', `Bearer ${token}`)
        .send({ reservationId: 'res-1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('returns 403 for Tech role', async () => {
      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/allocation/release')
        .set('Authorization', `Bearer ${token}`)
        .send({ reservationId: 'res-1' });
      expect(res.status).toBe(403);
    });
  });

  // ─── POST /api/v1/allocation/simulate ─────────────────────────────────────

  describe('POST /api/v1/allocation/simulate', () => {
    test('returns 400 for invalid body', async () => {
      const token = await makeToken('Supervisor');
      const res = await request(app)
        .post('/api/v1/allocation/simulate')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    test('simulates FIFO allocation without creating reservations', async () => {
      mockPrisma.lot.findMany.mockResolvedValue([
        { id: 'lot-1', materialId: 'mat-1', quantity: 200, status: 'ACTIVE', createdAt: new Date('2026-01-01') },
      ]);
      mockPrisma.reservation.aggregate.mockResolvedValue({ _sum: { quantity: 50 } });

      const token = await makeToken('Admin');
      const res = await request(app)
        .post('/api/v1/allocation/simulate')
        .set('Authorization', `Bearer ${token}`)
        .send({ materialId: 'mat-1', requiredQty: 100, strategy: 'FIFO' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.allocated).toHaveLength(1);
      expect(res.body.allocated[0].reserved).toBe(100);
      expect(res.body.shortage).toBe(0);

      // Should NOT have called $transaction
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    test('simulates shortage correctly', async () => {
      mockPrisma.lot.findMany.mockResolvedValue([
        { id: 'lot-1', materialId: 'mat-1', quantity: 30, status: 'ACTIVE', createdAt: new Date() },
      ]);
      mockPrisma.reservation.aggregate.mockResolvedValue({ _sum: { quantity: 10 } });

      const token = await makeToken('Supervisor');
      const res = await request(app)
        .post('/api/v1/allocation/simulate')
        .set('Authorization', `Bearer ${token}`)
        .send({ materialId: 'mat-1', requiredQty: 100, strategy: 'FIFO' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.shortage).toBe(80);
    });

    test('returns 403 for Tech role', async () => {
      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/allocation/simulate')
        .set('Authorization', `Bearer ${token}`)
        .send({ materialId: 'mat-1', requiredQty: 100, strategy: 'FIFO' });
      expect(res.status).toBe(403);
    });
  });
});
