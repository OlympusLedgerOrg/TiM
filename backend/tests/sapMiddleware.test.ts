// Ensure JWT secret is set before auth middleware is loaded
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

// Socket emitter mocked before app import
jest.mock('../src/sockets/workOrderSocket', () => ({
  emitStepCompleted: jest.fn(),
  emitQueueUpdated: jest.fn(),
}));

// Prisma mocked BEFORE importing app to avoid real DB calls.
const m = {
  tenant: { findUnique: jest.fn() },
  batch: { findFirst: jest.fn() },
  movement: { findFirst: jest.fn() },
  $queryRaw: jest.fn(),
};
jest.mock('../src/prisma/client', () => ({ prisma: m }));

import request from 'supertest';
import { app, server } from '../src/app';
import { SignJWT } from 'jose';
import { renderIDocXml, type IDocMessage } from '../src/services/sapMiddlewareService';

async function makeToken(role: 'Tech' | 'Supervisor' | 'Admin', tenantId = 'default') {
  const key = new TextEncoder().encode(process.env.JWT_SECRET!);
  return new SignJWT({ sub: 'user-1', role, tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
}

describe('GET /api/v1/sap/middleware/config', () => {
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => { try { server.close(); } catch (_) {} });

  test('returns 403 for Tech role', async () => {
    const token = await makeToken('Tech');
    const res = await request(app)
      .get('/api/v1/sap/middleware/config')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('returns 404 when tenant not found', async () => {
    m.tenant.findUnique.mockResolvedValue(null);
    const token = await makeToken('Admin');
    const res = await request(app)
      .get('/api/v1/sap/middleware/config')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('returns 200 with middleware config', async () => {
    m.tenant.findUnique.mockResolvedValue({ id: 'default', sapPlantCode: 'NC01' });
    const token = await makeToken('Admin');
    const res = await request(app)
      .get('/api/v1/sap/middleware/config')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('middleware');
  });
});

describe('GET /api/v1/sap/middleware/health', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 403 for Supervisor role', async () => {
    const token = await makeToken('Supervisor');
    const res = await request(app)
      .get('/api/v1/sap/middleware/health')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('returns 200 with connection status (no URL configured)', async () => {
    delete process.env.SAP_MIDDLEWARE_URL;
    const token = await makeToken('Admin');
    const res = await request(app)
      .get('/api/v1/sap/middleware/health')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('connected', false);
  });
});

describe('GET /api/v1/sap/middleware/idoc/batch/:batchId', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 404 when batch not found', async () => {
    m.batch.findFirst.mockResolvedValue(null);
    const token = await makeToken('Admin');
    const res = await request(app)
      .get('/api/v1/sap/middleware/idoc/batch/batch-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('returns 200 with IDoc for valid batch', async () => {
    const now = new Date();
    m.batch.findFirst.mockResolvedValue({
      id: 'batch-1',
      lotNumber: 'LOT-001',
      quantity: 500,
      createdAt: now,
      material: { sapMaterialNumber: 'MAT-001', description: 'EPDM', unitOfMeasure: 'KG' },
      workCenter: { code: 'MIX-01' },
    });
    const token = await makeToken('Supervisor');
    const res = await request(app)
      .get('/api/v1/sap/middleware/idoc/batch/batch-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('idoc');
    expect(res.body.idoc).toHaveProperty('idocType', 'LOIPRO07');
  });
});

describe('GET /api/v1/sap/middleware/idoc/batch/:batchId/xml', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 404 when batch not found', async () => {
    m.batch.findFirst.mockResolvedValue(null);
    const token = await makeToken('Admin');
    const res = await request(app)
      .get('/api/v1/sap/middleware/idoc/batch/batch-missing/xml')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('returns XML for valid batch', async () => {
    const now = new Date();
    m.batch.findFirst.mockResolvedValue({
      id: 'batch-1',
      lotNumber: 'LOT-001',
      quantity: 500,
      createdAt: now,
      material: { sapMaterialNumber: 'MAT-001', description: 'EPDM', unitOfMeasure: 'KG' },
      workCenter: { code: 'MIX-01' },
    });
    const token = await makeToken('Admin');
    const res = await request(app)
      .get('/api/v1/sap/middleware/idoc/batch/batch-1/xml')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toContain('<?xml');
    expect(res.text).toContain('LOIPRO07');
  });
});

describe('GET /api/v1/sap/middleware/idoc/movement/:movementId', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 404 when movement not found', async () => {
    m.movement.findFirst.mockResolvedValue(null);
    const token = await makeToken('Admin');
    const res = await request(app)
      .get('/api/v1/sap/middleware/idoc/movement/mv-missing')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('returns 200 with IDoc for valid movement', async () => {
    const now = new Date();
    m.movement.findFirst.mockResolvedValue({
      id: 'mv-1',
      quantity: 500,
      movedAt: now,
      notes: 'Test move',
      batch: {
        lotNumber: 'LOT-001',
        material: { sapMaterialNumber: 'MAT-001', unitOfMeasure: 'KG' },
      },
      fromWorkCenter: { code: 'MIX-01' },
      toWorkCenter: { code: 'EXT-01' },
    });
    const token = await makeToken('Supervisor');
    const res = await request(app)
      .get('/api/v1/sap/middleware/idoc/movement/mv-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('idoc');
    expect(res.body.idoc).toHaveProperty('idocType', 'MBGMCR03');
  });
});

describe('GET /api/v1/sap/middleware/idoc/movement/:movementId/xml', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 404 when movement not found', async () => {
    m.movement.findFirst.mockResolvedValue(null);
    const token = await makeToken('Admin');
    const res = await request(app)
      .get('/api/v1/sap/middleware/idoc/movement/mv-missing/xml')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('returns XML for valid movement', async () => {
    const now = new Date();
    m.movement.findFirst.mockResolvedValue({
      id: 'mv-1',
      quantity: 500,
      movedAt: now,
      notes: '',
      batch: {
        lotNumber: 'LOT-001',
        material: { sapMaterialNumber: 'MAT-001', unitOfMeasure: 'KG' },
      },
      fromWorkCenter: { code: 'MIX-01' },
      toWorkCenter: { code: 'EXT-01' },
    });
    const token = await makeToken('Admin');
    const res = await request(app)
      .get('/api/v1/sap/middleware/idoc/movement/mv-1/xml')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toContain('MBGMCR03');
  });
});

describe('renderIDocXml', () => {
  test('renders valid XML from IDoc message', () => {
    const idoc: IDocMessage = {
      idocType: 'TEST01',
      mesType: 'TEST',
      senderPort: 'TIM_PORT',
      senderPartner: 'TIM_SYSTEM',
      receiverPort: 'SAP_PORT',
      receiverPartner: 'SAPCLNT100',
      segments: [
        {
          name: 'E1TEST',
          fields: { FIELD1: 'value1', FIELD2: 'value2' },
          children: [
            {
              name: 'E1CHILD',
              fields: { CHILD_FIELD: 'child_value' },
            },
          ],
        },
      ],
    };
    const xml = renderIDocXml(idoc);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<IDOCTYP>TEST01</IDOCTYP>');
    expect(xml).toContain('<FIELD1>value1</FIELD1>');
    expect(xml).toContain('<E1CHILD>');
    expect(xml).toContain('<CHILD_FIELD>child_value</CHILD_FIELD>');
  });

  test('escapes XML special characters', () => {
    const idoc: IDocMessage = {
      idocType: 'TEST&01',
      mesType: 'TEST<>',
      senderPort: 'PORT',
      senderPartner: 'PARTNER"S',
      receiverPort: 'PORT',
      receiverPartner: "PARTNER'S",
      segments: [],
    };
    const xml = renderIDocXml(idoc);
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&gt;');
    expect(xml).toContain('&quot;');
    expect(xml).toContain('&apos;');
  });
});
