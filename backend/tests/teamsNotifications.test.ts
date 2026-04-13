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

// Mock the equipment service's sendTeamsAlert to prevent circular dependency issues
jest.mock('../src/services/teamsNotificationService', () => {
  const actual: Record<string, any> = {};
  return {
    ...actual,
    sendTeamsAlert: jest.fn().mockResolvedValue({ sent: 0, failed: 0 }),
    // Real functions we test need the prisma mock
    getTeamsWebhooks: jest.fn(),
    upsertTeamsWebhook: jest.fn(),
    testTeamsWebhook: jest.fn(),
    checkDowntimeEscalations: jest.fn(),
  };
});

// Prisma mocked BEFORE importing app to avoid real DB calls.
const m: Record<string, any> = {
  workCenter: { findFirst: jest.fn(), findMany: jest.fn() },
  equipment: { findFirst: jest.fn(), findMany: jest.fn() },
  downtimeEvent: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  teamsWebhook: { findFirst: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
  plantArea: { findMany: jest.fn(), findFirst: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../src/prisma/client', () => ({ prisma: m }));

import request from 'supertest';
import { app, server } from '../src/app';
import { SignJWT } from 'jose';
import {
  getTeamsWebhooks,
  upsertTeamsWebhook,
  testTeamsWebhook,
  checkDowntimeEscalations,
} from '../src/services/teamsNotificationService';

const mockedGetWebhooks = getTeamsWebhooks as jest.MockedFunction<typeof getTeamsWebhooks>;
const mockedUpsertWebhook = upsertTeamsWebhook as jest.MockedFunction<typeof upsertTeamsWebhook>;
const mockedTestWebhook = testTeamsWebhook as jest.MockedFunction<typeof testTeamsWebhook>;
const mockedCheckEscalations = checkDowntimeEscalations as jest.MockedFunction<typeof checkDowntimeEscalations>;

async function makeToken(role: 'Tech' | 'Supervisor' | 'Admin', tenantId = 'default') {
  const key = new TextEncoder().encode(process.env.JWT_SECRET!);
  return new SignJWT({ sub: 'user-1', role, tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
}

describe('Teams Notifications API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    try { server.close(); } catch (_) {}
  });

  // ─── GET /api/v1/teams/webhooks ───────────────────────────────────────────

  describe('GET /api/v1/teams/webhooks', () => {
    test('returns webhooks for Supervisor', async () => {
      mockedGetWebhooks.mockResolvedValue({
        status: 200,
        body: {
          webhooks: [
            {
              id: 'wh-1', name: 'Main Plant Alerts', channel: '#main-plant-alerts',
              onDowntime: true, onQualityFail: true, onShortage: false, onEscalation: true,
              downtimeThresholdMin: 15, isActive: true,
            },
            {
              id: 'wh-2', name: 'QC Team', channel: '#qc-team',
              onDowntime: false, onQualityFail: true, onShortage: true, onEscalation: false,
              downtimeThresholdMin: 30, isActive: true,
            },
          ],
        },
      } as any);

      const token = await makeToken('Supervisor');
      const res = await request(app)
        .get('/api/v1/teams/webhooks')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.webhooks).toHaveLength(2);
      expect(res.body.webhooks[0].name).toBe('Main Plant Alerts');
    });

    test('returns 403 for Tech role', async () => {
      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/teams/webhooks')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    test('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/teams/webhooks');
      expect(res.status).toBe(401);
    });
  });

  // ─── POST /api/v1/teams/webhooks ──────────────────────────────────────────

  describe('POST /api/v1/teams/webhooks', () => {
    test('returns 400 for invalid body', async () => {
      const token = await makeToken('Admin');
      const res = await request(app)
        .post('/api/v1/teams/webhooks')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    test('returns 400 for invalid webhook URL', async () => {
      const token = await makeToken('Admin');
      const res = await request(app)
        .post('/api/v1/teams/webhooks')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test', webhookUrl: 'not-a-url', channel: '#test' });
      expect(res.status).toBe(400);
    });

    test('creates webhook with valid data', async () => {
      mockedUpsertWebhook.mockResolvedValue({
        status: 200,
        body: {
          webhook: { id: 'wh-1', name: 'Shipping Alerts', channel: '#shipping-alerts', isActive: true },
        },
      } as any);

      const token = await makeToken('Admin');
      const res = await request(app)
        .post('/api/v1/teams/webhooks')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Shipping Alerts',
          webhookUrl: 'https://outlook.office.com/webhook/abc123',
          channel: '#shipping-alerts',
          plantAreaCode: 'SHIP',
          onDowntime: true,
          onQualityFail: false,
          downtimeThresholdMin: 20,
        });

      expect(res.status).toBe(200);
      expect(res.body.webhook.name).toBe('Shipping Alerts');
    });

    test('returns 403 for Tech role', async () => {
      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/teams/webhooks')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test', webhookUrl: 'https://example.com/hook', channel: '#test' });
      expect(res.status).toBe(403);
    });
  });

  // ─── POST /api/v1/teams/webhooks/:id/test ────────────────────────────────

  describe('POST /api/v1/teams/webhooks/:id/test', () => {
    test('sends test notification', async () => {
      mockedTestWebhook.mockResolvedValue({
        status: 200,
        body: { message: 'Test notification sent', success: true },
      } as any);

      const token = await makeToken('Supervisor');
      const res = await request(app)
        .post('/api/v1/teams/webhooks/wh-1/test')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── POST /api/v1/teams/check-escalations ────────────────────────────────

  describe('POST /api/v1/teams/check-escalations', () => {
    test('triggers escalation check', async () => {
      mockedCheckEscalations.mockResolvedValue(3);

      const token = await makeToken('Supervisor');
      const res = await request(app)
        .post('/api/v1/teams/check-escalations')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.escalated).toBe(3);
    });

    test('returns 403 for Tech', async () => {
      const token = await makeToken('Tech');
      const res = await request(app)
        .post('/api/v1/teams/check-escalations')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });
  });
});

describe('Plant Areas API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── GET /api/v1/plant-areas ──────────────────────────────────────────────

  describe('GET /api/v1/plant-areas', () => {
    test('returns 3 Rutherfordton plant areas', async () => {
      m.plantArea.findMany.mockResolvedValue([
        {
          id: 'pa-1', code: 'MAIN', name: 'Main Plant', description: 'Core production — presses, mixers, mills',
          _count: { workCenters: 8, equipment: 12 },
        },
        {
          id: 'pa-2', code: 'SHIP', name: 'Shipping', description: 'Staging, packaging, loading docks',
          _count: { workCenters: 3, equipment: 4 },
        },
        {
          id: 'pa-3', code: 'NEW', name: 'New Plant', description: 'Expansion area — newer equipment',
          _count: { workCenters: 5, equipment: 6 },
        },
      ]);

      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/plant-areas')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.plantAreas).toHaveLength(3);
      expect(res.body.plantAreas[0].code).toBe('MAIN');
      expect(res.body.plantAreas[1].code).toBe('SHIP');
      expect(res.body.plantAreas[2].code).toBe('NEW');
    });
  });

  // ─── GET /api/v1/plant-areas/:code ────────────────────────────────────────

  describe('GET /api/v1/plant-areas/:code', () => {
    test('returns plant area detail with work centers and equipment', async () => {
      m.plantArea.findFirst.mockResolvedValue({
        id: 'pa-1', code: 'MAIN', name: 'Main Plant',
        description: 'Core production',
        workCenters: [
          { id: 'wc-1', code: 'MIX-01', name: 'Mixer Line 1' },
          { id: 'wc-2', code: 'PRESS-01', name: 'Press Line 1' },
        ],
        equipment: [
          { id: 'eq-1', code: 'MIX-01-A', name: 'Banbury Mixer', type: 'mixer', status: 'RUNNING', statusSince: new Date() },
          { id: 'eq-2', code: 'PRESS-01-A', name: 'Hydraulic Press', type: 'press', status: 'IDLE', statusSince: new Date() },
        ],
      });

      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/plant-areas/MAIN')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.plantArea.code).toBe('MAIN');
      expect(res.body.plantArea.workCenters).toHaveLength(2);
      expect(res.body.plantArea.equipment).toHaveLength(2);
    });

    test('returns 404 for unknown area', async () => {
      m.plantArea.findFirst.mockResolvedValue(null);
      const token = await makeToken('Tech');
      const res = await request(app)
        .get('/api/v1/plant-areas/NOPE')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });
});
