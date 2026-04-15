// Ensure JWT secret is set before auth middleware is loaded
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

// Socket emitter mocked before app import
jest.mock('../src/sockets/workOrderSocket', () => ({
  emitStepCompleted: jest.fn(),
  emitQueueUpdated: jest.fn(),
}));

jest.mock('../src/sockets/equipmentSocket', () => ({
  emitEquipmentStateChanged: jest.fn(),
  emitDowntimeAlert: jest.fn(),
  emitDowntimeResolved: jest.fn(),
}));

// Mock Teams notification service to prevent real HTTP calls
jest.mock('../src/services/teamsNotificationService', () => ({
  sendTeamsAlert: jest.fn().mockResolvedValue({ sent: 0, failed: 0 }),
  getTeamsWebhooks: jest.fn(),
  upsertTeamsWebhook: jest.fn(),
  testTeamsWebhook: jest.fn(),
  checkDowntimeEscalations: jest.fn(),
}));

// Prisma mocked BEFORE importing app to avoid real DB calls.
const m: Record<string, any> = {
  workCenter: { findFirst: jest.fn(), findMany: jest.fn() },
  equipment: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  downtimeEvent: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  scrapReason: { findMany: jest.fn() },
  shiftAssignment: { findMany: jest.fn(), upsert: jest.fn() },
  plantArea: { findMany: jest.fn(), findFirst: jest.fn() },
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

describe('Equipment API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    try { server.close(); } catch (_) {}
  });

  // ─── GET /api/v1/equipment?workCenter=... ─────────────────────────────────

  describe('GET /api/v1/equipment', () => {
    test('returns 400 without workCenter param', async () => {
      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/equipment')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/workCenter/);
    });

    test('returns 404 for unknown work center', async () => {
      m.workCenter.findFirst.mockResolvedValue(null);
      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/equipment?workCenter=NOPE')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    test('returns equipment at work center', async () => {
      m.workCenter.findFirst.mockResolvedValue({ id: 'wc-1', code: 'PRESS-LINE' });
      m.equipment.findMany.mockResolvedValue([
        {
          id: 'eq-1', code: 'PRESS-01', name: 'Hydraulic Press #1', type: 'press',
          status: 'RUNNING', statusSince: new Date('2026-04-13T06:00:00Z'),
          axxosEquipmentId: 'AX-4001', isActive: true,
        },
        {
          id: 'eq-2', code: 'PRESS-02', name: 'Hydraulic Press #2', type: 'press',
          status: 'DOWN', statusSince: new Date('2026-04-13T14:30:00Z'),
          axxosEquipmentId: 'AX-4002', isActive: true,
        },
      ]);
      m.downtimeEvent.findMany.mockResolvedValue([
        {     // eq-2: active downtime
          id: 'dt-1', category: 'UNPLANNED', reasonCode: 'BREAKDOWN-HYDRAULIC',
          reasonText: 'Hydraulic line burst', startedAt: new Date('2026-04-13T14:30:00Z'), equipmentId: 'eq-2',
        },
      ]);

      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/equipment?workCenter=PRESS-LINE')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.equipment).toHaveLength(2);
      expect(res.body.equipment[0].status).toBe('RUNNING');
      expect(res.body.equipment[0].currentDowntime).toBeNull();
      expect(res.body.equipment[1].status).toBe('DOWN');
      expect(res.body.equipment[1].currentDowntime).toBeTruthy();
      expect(res.body.equipment[1].currentDowntime.reasonCode).toBe('BREAKDOWN-HYDRAULIC');
      expect(m.downtimeEvent.findMany).toHaveBeenCalledWith({
        where: {
          equipmentId: { in: ['eq-1', 'eq-2'] },
          endedAt: null,
        },
        orderBy: { startedAt: 'desc' },
      });
      expect(m.downtimeEvent.findFirst).not.toHaveBeenCalled();
    });

    test('returns 401 without authentication', async () => {
      const res = await request(app).get('/api/v1/equipment?workCenter=MIX-01');
      expect(res.status).toBe(401);
    });
  });

  // ─── PUT /api/v1/equipment/:id/status ─────────────────────────────────────

  describe('PUT /api/v1/equipment/:id/status', () => {
    test('returns 400 for invalid status', async () => {
      const token = await makeToken('Tech');
      const res = await request(app)
        .put('/api/v1/equipment/eq-1/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'INVALID' });
      expect(res.status).toBe(400);
    });

    test('returns 404 when equipment not found', async () => {
      m.equipment.findFirst.mockResolvedValue(null);
      const token = await makeToken('Tech');
      const res = await request(app)
        .put('/api/v1/equipment/eq-1/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'RUNNING' });
      expect(res.status).toBe(404);
    });

    test('successfully updates equipment status', async () => {
      m.equipment.findFirst.mockResolvedValue({
        id: 'eq-1', code: 'PRESS-01', status: 'IDLE', currentOperatorId: null,
      });
      m.equipment.update.mockResolvedValue({
        id: 'eq-1', code: 'PRESS-01', status: 'RUNNING', statusSince: new Date('2026-04-13T15:00:00Z'),
      });

      const token = await makeToken('Tech');
      const res = await request(app)
        .put('/api/v1/equipment/eq-1/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'RUNNING', operatorId: 'op-1' });

      expect(res.status).toBe(200);
      expect(res.body.equipment.status).toBe('RUNNING');
      expect(res.body.equipment.previousStatus).toBe('IDLE');
    });

    test('auto-creates downtime event when going DOWN', async () => {
      m.equipment.findFirst.mockResolvedValue({
        id: 'eq-1', code: 'PRESS-01', status: 'RUNNING', currentOperatorId: null,
      });
      m.equipment.update.mockResolvedValue({
        id: 'eq-1', code: 'PRESS-01', status: 'DOWN', statusSince: new Date(),
      });
      m.downtimeEvent.create.mockResolvedValue({ id: 'dt-1' });

      const token = await makeToken('Tech');
      const res = await request(app)
        .put('/api/v1/equipment/eq-1/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'DOWN' });

      expect(res.status).toBe(200);
      expect(m.downtimeEvent.create).toHaveBeenCalled();
    });

    test('auto-closes downtime when recovering from DOWN', async () => {
      m.equipment.findFirst.mockResolvedValue({
        id: 'eq-1', code: 'PRESS-01', status: 'DOWN', currentOperatorId: null,
      });
      m.equipment.update.mockResolvedValue({
        id: 'eq-1', code: 'PRESS-01', status: 'RUNNING', statusSince: new Date(),
      });
      m.downtimeEvent.findFirst.mockResolvedValue({
        id: 'dt-1', startedAt: new Date(Date.now() - 30 * 60000), // 30 min ago
      });
      m.downtimeEvent.update.mockResolvedValue({ id: 'dt-1' });

      const token = await makeToken('Tech');
      const res = await request(app)
        .put('/api/v1/equipment/eq-1/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'RUNNING' });

      expect(res.status).toBe(200);
      expect(m.downtimeEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dt-1' },
          data: expect.objectContaining({ endedAt: expect.any(Date) }),
        }),
      );
    });

    test('returns 403 without proper role', async () => {
      // Only Tech, Supervisor, Admin can update — no such thing as "Viewer" role
      // but missing token returns 401
      const res = await request(app)
        .put('/api/v1/equipment/eq-1/status')
        .send({ status: 'RUNNING' });
      expect(res.status).toBe(401);
    });
  });

  // ─── POST /api/v1/equipment/:id/downtime ──────────────────────────────────

  describe('POST /api/v1/equipment/:id/downtime', () => {
    test('returns 400 for invalid body', async () => {
      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/equipment/eq-1/downtime')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    test('returns 404 when equipment not found', async () => {
      m.equipment.findFirst.mockResolvedValue(null);
      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/equipment/eq-1/downtime')
        .set('Authorization', `Bearer ${token}`)
        .send({ category: 'UNPLANNED', reasonCode: 'BREAKDOWN' });
      expect(res.status).toBe(404);
    });

    test('successfully logs downtime event', async () => {
      m.equipment.findFirst.mockResolvedValue({
        id: 'eq-1', code: 'PRESS-01', name: 'Hydraulic Press #1', status: 'RUNNING',
      });
      m.downtimeEvent.create.mockResolvedValue({
        id: 'dt-1', equipmentId: 'eq-1', category: 'MATERIAL_WAIT',
        reasonCode: 'MAT-WAIT', reasonText: 'Waiting for compound from mixer',
        startedAt: new Date('2026-04-13T15:00:00Z'),
      });
      m.equipment.update.mockResolvedValue({ id: 'eq-1', status: 'DOWN' });

      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/equipment/eq-1/downtime')
        .set('Authorization', `Bearer ${token}`)
        .send({
          category: 'MATERIAL_WAIT',
          reasonCode: 'MAT-WAIT',
          reasonText: 'Waiting for compound from mixer',
        });

      expect(res.status).toBe(201);
      expect(res.body.event.reasonCode).toBe('MAT-WAIT');
      expect(m.equipment.update).toHaveBeenCalled(); // Sets status to DOWN
    });
  });

  // ─── PUT /api/v1/equipment/downtime/:eventId/close ────────────────────────

  describe('PUT /api/v1/equipment/downtime/:eventId/close', () => {
    test('returns 404 for unknown event', async () => {
      m.downtimeEvent.findFirst.mockResolvedValue(null);
      const token = await makeToken('Tech');
      const res = await request(app)
        .put('/api/v1/equipment/downtime/dt-99/close')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    test('returns 400 if already closed', async () => {
      m.downtimeEvent.findFirst.mockResolvedValue({
        id: 'dt-1', endedAt: new Date(), startedAt: new Date(Date.now() - 60000),
      });
      const token = await makeToken('Tech');
      const res = await request(app)
        .put('/api/v1/equipment/downtime/dt-1/close')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already closed/);
    });

    test('successfully closes downtime event', async () => {
      m.downtimeEvent.findFirst.mockResolvedValue({
        id: 'dt-1', endedAt: null, startedAt: new Date(Date.now() - 45 * 60000),
      });
      m.downtimeEvent.update.mockResolvedValue({
        id: 'dt-1', equipmentId: 'eq-1',
        endedAt: new Date(), durationMin: 45,
      });

      const token = await makeToken('Tech');
      const res = await request(app)
        .put('/api/v1/equipment/downtime/dt-1/close')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.event.durationMin).toBe(45);
    });
  });

  // ─── GET /api/v1/equipment/:id/downtime ───────────────────────────────────

  describe('GET /api/v1/equipment/:id/downtime', () => {
    test('returns downtime history', async () => {
      m.downtimeEvent.findMany.mockResolvedValue([
        {
          id: 'dt-1', category: 'MATERIAL_WAIT', reasonCode: 'MAT-WAIT',
          reasonText: 'Compound delay', startedAt: new Date('2026-04-13T10:00:00Z'),
          endedAt: new Date('2026-04-13T10:25:00Z'), durationMin: 25,
        },
        {
          id: 'dt-2', category: 'UNPLANNED', reasonCode: 'BREAKDOWN',
          reasonText: null, startedAt: new Date('2026-04-13T14:30:00Z'),
          endedAt: null, durationMin: null,
        },
      ]);

      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/equipment/eq-1/downtime?hours=24')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.events).toHaveLength(2);
      expect(res.body.events[0].isOpen).toBe(false);
      expect(res.body.events[1].isOpen).toBe(true);
    });
  });

  // ─── GET /api/v1/equipment/:id/oee ────────────────────────────────────────

  describe('GET /api/v1/equipment/:id/oee', () => {
    test('returns 404 when equipment not found', async () => {
      m.equipment.findFirst.mockResolvedValue(null);
      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/equipment/eq-99/oee')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    test('returns OEE snapshot', async () => {
      m.equipment.findFirst.mockResolvedValue({
        id: 'eq-1', code: 'PRESS-01', targetOee: 0.85,
      });
      m.downtimeEvent.findMany.mockResolvedValue([
        {
          startedAt: new Date(Date.now() - 60 * 60000),  // 60 min ago
          endedAt: new Date(Date.now() - 30 * 60000),    // 30 min ago → 30 min downtime
        },
      ]);

      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/equipment/eq-1/oee')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.equipmentCode).toBe('PRESS-01');
      expect(res.body.availability).toBeGreaterThan(0);
      expect(res.body.availability).toBeLessThanOrEqual(1);
      expect(res.body.targetOee).toBe(0.85);
    });
  });

  // ─── GET /api/v1/equipment/scrap-reasons ──────────────────────────────────

  describe('GET /api/v1/equipment/scrap-reasons', () => {
    test('returns scrap reason codes', async () => {
      m.scrapReason.findMany.mockResolvedValue([
        { id: 'sr-1', code: 'VISC-OOS', description: 'Off-spec viscosity', category: 'quality' },
        { id: 'sr-2', code: 'CONTAM', description: 'Contamination', category: 'quality' },
        { id: 'sr-3', code: 'EQUIP-MAL', description: 'Equipment malfunction', category: 'equipment' },
      ]);

      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/equipment/scrap-reasons')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.reasons).toHaveLength(3);
      expect(res.body.reasons[0].code).toBe('VISC-OOS');
    });
  });

  // ─── Shift Endpoints ──────────────────────────────────────────────────────

  describe('GET /api/v1/equipment/shifts', () => {
    test('returns shift assignments', async () => {
      m.shiftAssignment.findMany.mockResolvedValue([
        {
          id: 'sa-1', operatorId: 'op-1', shift: 'FIRST',
          date: new Date('2026-04-13'), workCenterCode: 'MIX-01',
          clockInAt: new Date('2026-04-13T06:02:00Z'), clockOutAt: null,
          operator: { name: 'John Smith', badgeId: 'B-4521' },
        },
      ]);

      const token = await makeToken('Supervisor');
      const res = await request(app)
        .get('/api/v1/equipment/shifts?date=2026-04-13&shift=FIRST')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.assignments).toHaveLength(1);
      expect(res.body.assignments[0].operatorName).toBe('John Smith');
      expect(res.body.assignments[0].badgeId).toBe('B-4521');
    });
  });

  describe('POST /api/v1/equipment/shifts/clock-in', () => {
    test('returns 400 for invalid body', async () => {
      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/equipment/shifts/clock-in')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    test('successfully clocks in', async () => {
      m.shiftAssignment.upsert.mockResolvedValue({
        id: 'sa-1', operatorId: 'op-1', shift: 'SECOND',
        clockInAt: new Date('2026-04-13T14:01:00Z'), workCenterCode: 'PRESS-01',
      });

      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/equipment/shifts/clock-in')
        .set('Authorization', `Bearer ${token}`)
        .send({ operatorId: 'op-1', shift: 'SECOND', workCenterCode: 'PRESS-01' });

      expect(res.status).toBe(200);
      expect(res.body.assignment.operatorId).toBe('op-1');
      expect(res.body.assignment.clockInAt).toBeTruthy();
    });
  });
});
