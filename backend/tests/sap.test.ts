// Ensure JWT secret is set before auth middleware is loaded
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

// Socket emitter mocked before app import
jest.mock('../src/sockets/workOrderSocket', () => ({
  emitStepCompleted: jest.fn(),
  emitQueueUpdated: jest.fn(),
}));

// Prisma mocked BEFORE importing app to avoid real DB calls.
const m = {
  material: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  batch: { findMany: jest.fn() },
  movement: { findMany: jest.fn() },
  tenant: { findUnique: jest.fn() },
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

describe('GET /api/v1/sap/plant', () => {
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => { try { server.close(); } catch (_) {} });

  test('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/sap/plant');
    expect(res.status).toBe(401);
  });

  test('returns 404 when tenant not found', async () => {
    m.tenant.findUnique.mockResolvedValue(null);
    const token = await makeToken('Tech');
    const res = await request(app)
      .get('/api/v1/sap/plant')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('returns 200 with plant info', async () => {
    m.tenant.findUnique.mockResolvedValue({
      id: 'default',
      name: 'Rutherfordton',
      sapPlantCode: 'NC01',
      workCenters: [
        { code: 'MIX-01', name: 'Mixing', description: 'Mixing Line 1' },
      ],
    });
    const token = await makeToken('Tech');
    const res = await request(app)
      .get('/api/v1/sap/plant')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('PlantCode', 'NC01');
    expect(res.body).toHaveProperty('PlantName', 'Rutherfordton');
    expect(res.body.WorkCenters).toHaveLength(1);
  });
});

describe('GET /api/v1/sap/materials', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 200 with materials in SAP format', async () => {
    const now = new Date();
    m.material.findMany.mockResolvedValue([
      { id: 'mat-1', sapMaterialNumber: 'MAT-001', description: 'EPDM Compound', unitOfMeasure: 'KG', createdAt: now },
    ]);
    const token = await makeToken('Tech');
    const res = await request(app)
      .get('/api/v1/sap/materials')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body['@odata.context']).toBeDefined();
    expect(res.body.value).toHaveLength(1);
    expect(res.body.value[0]).toHaveProperty('MaterialNumber', 'MAT-001');
  });
});

describe('GET /api/v1/sap/batches', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 200 with batches in SAP format', async () => {
    const now = new Date();
    m.batch.findMany.mockResolvedValue([
      {
        id: 'b-1',
        lotNumber: 'LOT-001',
        quantity: 500,
        status: 'IN_PROGRESS',
        createdAt: now,
        updatedAt: now,
        material: { sapMaterialNumber: 'MAT-001', description: 'EPDM Compound', unitOfMeasure: 'KG' },
        workCenter: { code: 'MIX-01', name: 'Mixing' },
      },
    ]);
    const token = await makeToken('Tech');
    const res = await request(app)
      .get('/api/v1/sap/batches')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.value).toHaveLength(1);
    expect(res.body.value[0]).toHaveProperty('LotNumber', 'LOT-001');
  });

  test('supports status and workCenter filters', async () => {
    m.batch.findMany.mockResolvedValue([]);
    const token = await makeToken('Tech');
    const res = await request(app)
      .get('/api/v1/sap/batches?status=IN_PROGRESS&workCenter=MIX-01')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.value).toEqual([]);
  });
});

describe('GET /api/v1/sap/movements', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 200 with movements', async () => {
    const now = new Date();
    m.movement.findMany.mockResolvedValue([
      {
        id: 'mv-1',
        quantity: 500,
        movedByUserId: 'user-1',
        movedAt: now,
        notes: 'Moved',
        olympusCommitId: 'oc-1',
        batch: {
          lotNumber: 'LOT-001',
          material: { sapMaterialNumber: 'MAT-001', unitOfMeasure: 'KG' },
        },
        fromWorkCenter: { code: 'MIX-01' },
        toWorkCenter: { code: 'EXT-01' },
      },
    ]);
    const token = await makeToken('Tech');
    const res = await request(app)
      .get('/api/v1/sap/movements')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.value).toHaveLength(1);
    expect(res.body.value[0]).toHaveProperty('LotNumber', 'LOT-001');
  });

  test('returns 400 for invalid fromDate', async () => {
    const token = await makeToken('Tech');
    const res = await request(app)
      .get('/api/v1/sap/movements?fromDate=not-a-date')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test('supports valid fromDate filter', async () => {
    m.movement.findMany.mockResolvedValue([]);
    const token = await makeToken('Tech');
    const res = await request(app)
      .get('/api/v1/sap/movements?fromDate=2024-01-01T00:00:00Z')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/sap/materials/sync', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 403 for Tech role', async () => {
    const token = await makeToken('Tech');
    const res = await request(app)
      .post('/api/v1/sap/materials/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ materialNumber: 'MAT-001', description: 'Test', unitOfMeasure: 'KG' });
    expect(res.status).toBe(403);
  });

  test('returns 400 with invalid body', async () => {
    const token = await makeToken('Admin');
    const res = await request(app)
      .post('/api/v1/sap/materials/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('returns 200 when updating existing material', async () => {
    m.material.findFirst.mockResolvedValue({ id: 'mat-1', sapMaterialNumber: 'MAT-001' });
    m.material.update.mockResolvedValue({ id: 'mat-1', sapMaterialNumber: 'MAT-001', description: 'Updated', unitOfMeasure: 'KG' });
    const token = await makeToken('Admin');
    const res = await request(app)
      .post('/api/v1/sap/materials/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ materialNumber: 'MAT-001', description: 'Updated', unitOfMeasure: 'KG' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('created', false);
  });

  test('returns 201 when creating new material', async () => {
    m.material.findFirst.mockResolvedValue(null);
    m.material.create.mockResolvedValue({ id: 'mat-2', sapMaterialNumber: 'MAT-002', description: 'New', unitOfMeasure: 'LB' });
    const token = await makeToken('Supervisor');
    const res = await request(app)
      .post('/api/v1/sap/materials/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ materialNumber: 'MAT-002', description: 'New', unitOfMeasure: 'LB' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('created', true);
  });
});
