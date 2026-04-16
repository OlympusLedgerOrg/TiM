/**
 * Analytics API Tests — Management Dashboard & Reporting Endpoints
 */

// Mock Prisma before any imports
jest.mock('../src/prisma/client', () => {
  const mockPrisma = {
    $queryRaw: jest.fn(),
    equipment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    downtimeEvent: {
      findMany: jest.fn(),
    },
    inventoryMovement: {
      findMany: jest.fn(),
    },
    workOrder: {
      findMany: jest.fn(),
    },
    shiftAssignment: {
      findMany: jest.fn(),
    },
    plantArea: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    workCenter: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    material: {
      findFirst: jest.fn(),
    },
    batch: {
      findFirst: jest.fn(),
    },
    movement: {
      findFirst: jest.fn(),
    },
  };
  return { prisma: mockPrisma };
});

import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/prisma/client';
import { SignJWT } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'change-me');

async function makeToken(role: string = 'Supervisor', tenantId: string = 'tenant-1') {
  return new SignJWT({ sub: 'user-1', role, tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

// ─── KPI Endpoint ─────────────────────────────────────────────────────────────

describe('GET /api/v1/analytics/kpis', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/analytics/kpis');
    expect(res.status).toBe(401);
  });

  it('returns 403 for Tech role', async () => {
    const token = await makeToken('Tech');
    const res = await request(app)
      .get('/api/v1/analytics/kpis')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns KPIs for Supervisor', async () => {
    const token = await makeToken('Supervisor');

    (prisma.equipment.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'eq-1', status: 'RUNNING', isActive: true },
      { id: 'eq-2', status: 'DOWN', isActive: true },
    ]);
    (prisma.downtimeEvent.findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma.inventoryMovement.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // produce
      .mockResolvedValueOnce([]); // scrap
    (prisma.workOrder.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/v1/analytics/kpis')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.kpis).toBeDefined();
    expect(res.body.kpis.totalEquipment).toBe(2);
    expect(res.body.kpis.runningEquipment).toBe(1);
    expect(res.body.kpis.downEquipment).toBe(1);
    expect(typeof res.body.kpis.oee).toBe('number');
    expect(typeof res.body.kpis.availability).toBe('number');
    expect(typeof res.body.kpis.scrapRate).toBe('number');
    expect(typeof res.body.kpis.onTimeDelivery).toBe('number');
  });
});

// ─── Shift Comparison ─────────────────────────────────────────────────────────

describe('GET /api/v1/analytics/shift-comparison', () => {
  it('returns shift comparisons', async () => {
    const token = await makeToken('Supervisor');

    (prisma.shiftAssignment.findMany as jest.Mock).mockResolvedValueOnce([
      { shift: 'FIRST', date: new Date('2026-04-13'), clockInAt: new Date(), operatorId: 'op-1' },
    ]);
    (prisma.downtimeEvent.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'dt-1', startedAt: new Date('2026-04-13T08:00:00Z'),
        endedAt: new Date('2026-04-13T08:30:00Z'), durationMin: 30,
        category: 'UNPLANNED', reasonCode: 'MOLD_BREAK',
      },
    ]);

    const res = await request(app)
      .get('/api/v1/analytics/shift-comparison?days=7')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.comparisons).toBeDefined();
    expect(Array.isArray(res.body.comparisons)).toBe(true);
  });
});

// ─── Downtime Trends ──────────────────────────────────────────────────────────

describe('GET /api/v1/analytics/downtime-trends', () => {
  it('returns daily trends', async () => {
    const token = await makeToken('Admin');

    (prisma.downtimeEvent.findMany as jest.Mock).mockResolvedValueOnce([
      {
        startedAt: new Date('2026-04-10T10:00:00Z'),
        endedAt: new Date('2026-04-10T10:45:00Z'),
        durationMin: 45,
        category: 'UNPLANNED',
      },
      {
        startedAt: new Date('2026-04-11T14:00:00Z'),
        endedAt: new Date('2026-04-11T14:20:00Z'),
        durationMin: 20,
        category: 'PLANNED',
      },
    ]);

    const res = await request(app)
      .get('/api/v1/analytics/downtime-trends?granularity=daily')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.trends).toBeDefined();
    expect(res.body.granularity).toBe('daily');
    expect(Array.isArray(res.body.trends)).toBe(true);
  });

  it('rejects invalid granularity', async () => {
    const token = await makeToken('Supervisor');
    const res = await request(app)
      .get('/api/v1/analytics/downtime-trends?granularity=hourly')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

// ─── Shift Report ─────────────────────────────────────────────────────────────

describe('GET /api/v1/analytics/shift-report', () => {
  it('generates a shift report', async () => {
    const token = await makeToken('Supervisor');

    (prisma.shiftAssignment.findMany as jest.Mock).mockResolvedValueOnce([
      {
        operator: { name: 'John', badgeId: 'B001' },
        clockInAt: new Date('2026-04-13T07:05:00Z'),
        clockOutAt: null,
        workCenterCode: 'MIX-01',
      },
    ]);
    (prisma.downtimeEvent.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'dt-1',
        equipmentId: 'eq-1',
        equipment: { code: 'PRESS-01', name: 'Hydraulic Press' },
        category: 'UNPLANNED',
        reasonCode: 'BEARING',
        reasonText: 'Bearing failure',
        startedAt: new Date('2026-04-13T09:00:00Z'),
        endedAt: new Date('2026-04-13T09:30:00Z'),
        durationMin: 30,
      },
    ]);
    (prisma.inventoryMovement.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // produce
      .mockResolvedValueOnce([]) // consume
      .mockResolvedValueOnce([]); // scrap

    const res = await request(app)
      .get('/api/v1/analytics/shift-report?date=2026-04-13&shift=FIRST')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.report).toBeDefined();
    expect(res.body.report.shift).toBe('FIRST');
    expect(res.body.report.date).toBe('2026-04-13');
    expect(res.body.report.operators).toBeDefined();
    expect(res.body.report.downtime).toBeDefined();
    expect(res.body.report.production).toBeDefined();
    expect(res.body.report.quality).toBeDefined();
  });
});

// ─── Worker Performance ───────────────────────────────────────────────────────

describe('GET /api/v1/analytics/worker-performance', () => {
  it('returns worker metrics', async () => {
    const token = await makeToken('Admin');

    (prisma.shiftAssignment.findMany as jest.Mock).mockResolvedValueOnce([
      {
        operatorId: 'op-1',
        operator: { name: 'Jane Doe', badgeId: 'B002' },
        clockInAt: new Date('2026-04-13T07:00:00Z'),
        clockOutAt: new Date('2026-04-13T15:00:00Z'),
      },
      {
        operatorId: 'op-1',
        operator: { name: 'Jane Doe', badgeId: 'B002' },
        clockInAt: new Date('2026-04-14T07:00:00Z'),
        clockOutAt: new Date('2026-04-14T15:00:00Z'),
      },
    ]);

    const res = await request(app)
      .get('/api/v1/analytics/worker-performance')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.workers).toBeDefined();
    expect(res.body.workers.length).toBe(1);
    expect(res.body.workers[0].operatorName).toBe('Jane Doe');
    expect(res.body.workers[0].shiftsWorked).toBe(2);
    expect(res.body.workers[0].totalClockMinutes).toBe(960); // 2 × 8h × 60min
  });
});

// ─── SAP Sync Status ──────────────────────────────────────────────────────────

describe('GET /api/v1/analytics/sap-sync-status', () => {
  it('returns sync status', async () => {
    const token = await makeToken('Supervisor');

    (prisma.material.findFirst as jest.Mock).mockResolvedValueOnce({ updatedAt: new Date() });
    (prisma.batch.findFirst as jest.Mock).mockResolvedValueOnce({ updatedAt: new Date() });
    (prisma.movement.findFirst as jest.Mock).mockResolvedValueOnce({ movedAt: new Date() });

    const res = await request(app)
      .get('/api/v1/analytics/sap-sync-status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.syncStatus).toBeDefined();
    expect(res.body.syncStatus.overallStatus).toBe('ok');
    expect(res.body.syncStatus.materials).toBeDefined();
    expect(res.body.syncStatus.batches).toBeDefined();
    expect(res.body.syncStatus.movements).toBeDefined();
  });
});

// ─── Drill-Down ───────────────────────────────────────────────────────────────

describe('GET /api/v1/analytics/drill-down', () => {
  it('returns plant-level drill-down', async () => {
    const token = await makeToken('Admin');

    (prisma.plantArea.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'pa-1', code: 'MAIN', name: 'Main Plant', isActive: true },
    ]);
    (prisma.equipment.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'eq-1', plantAreaId: 'pa-1', status: 'RUNNING', isActive: true },
    ]);

    const res = await request(app)
      .get('/api/v1/analytics/drill-down')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.level).toBe('plant');
    expect(res.body.plantAreas).toBeDefined();
    expect(res.body.plantAreas.length).toBe(1);
    expect(res.body.plantAreas[0].code).toBe('MAIN');
  });
});
