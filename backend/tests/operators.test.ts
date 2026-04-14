/**
 * Operator Management API Tests — CRUD + Bulk Import
 */

// Mock Prisma before any imports
jest.mock('../src/prisma/client', () => {
  const mockPrisma = {
    $queryRaw: jest.fn(),
    operator: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };
  return { prisma: mockPrisma };
});

import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/prisma/client';
import { SignJWT } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'change-me');

async function makeToken(role: string = 'Admin', tenantId: string = 'tenant-1') {
  return new SignJWT({ sub: 'user-1', role, tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

// ─── List Operators ───────────────────────────────────────────────────────────

describe('GET /api/v1/operators', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/operators');
    expect(res.status).toBe(401);
  });

  it('returns 403 for Tech role', async () => {
    const token = await makeToken('Tech');
    const res = await request(app)
      .get('/api/v1/operators')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('lists operators for Supervisor', async () => {
    const token = await makeToken('Supervisor');

    (prisma.operator.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'op-1', name: 'John Doe', badgeId: 'B001', isActive: true, createdAt: new Date() },
    ]);
    (prisma.operator.count as jest.Mock).mockResolvedValueOnce(1);

    const res = await request(app)
      .get('/api/v1/operators')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.operators).toBeDefined();
    expect(res.body.operators.length).toBe(1);
    expect(res.body.operators[0].name).toBe('John Doe');
    expect(res.body.pagination).toBeDefined();
  });

  it('supports search parameter', async () => {
    const token = await makeToken('Admin');

    (prisma.operator.findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma.operator.count as jest.Mock).mockResolvedValueOnce(0);

    const res = await request(app)
      .get('/api/v1/operators?search=Jane')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.operators).toEqual([]);
  });
});

// ─── Create Operator ──────────────────────────────────────────────────────────

describe('POST /api/v1/operators', () => {
  it('requires Admin role', async () => {
    const token = await makeToken('Supervisor');
    const res = await request(app)
      .post('/api/v1/operators')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test', badgeId: 'B999' });
    expect(res.status).toBe(403);
  });

  it('creates an operator', async () => {
    const token = await makeToken('Admin');

    (prisma.operator.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (prisma.operator.create as jest.Mock).mockResolvedValueOnce({
      id: 'op-new', name: 'New Person', badgeId: 'B100', isActive: true, createdAt: new Date(),
    });

    const res = await request(app)
      .post('/api/v1/operators')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Person', badgeId: 'B100' });

    expect(res.status).toBe(201);
    expect(res.body.operator.name).toBe('New Person');
    expect(res.body.operator.badgeId).toBe('B100');
  });

  it('rejects duplicate badge ID', async () => {
    const token = await makeToken('Admin');

    (prisma.operator.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'op-existing', name: 'Existing', badgeId: 'B001',
    });

    const res = await request(app)
      .post('/api/v1/operators')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Duplicate', badgeId: 'B001' });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('already assigned');
  });

  it('validates required fields', async () => {
    const token = await makeToken('Admin');

    const res = await request(app)
      .post('/api/v1/operators')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

// ─── Update Operator ──────────────────────────────────────────────────────────

describe('PUT /api/v1/operators/:id', () => {
  it('updates operator name', async () => {
    const token = await makeToken('Admin');

    (prisma.operator.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'op-1', name: 'Old Name', badgeId: 'B001', isActive: true,
    });
    (prisma.operator.update as jest.Mock).mockResolvedValueOnce({
      id: 'op-1', name: 'New Name', badgeId: 'B001', isActive: true, createdAt: new Date(),
    });

    const res = await request(app)
      .put('/api/v1/operators/op-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.operator.name).toBe('New Name');
  });

  it('returns 404 for non-existent operator', async () => {
    const token = await makeToken('Admin');
    (prisma.operator.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .put('/api/v1/operators/nonexistent')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test' });

    expect(res.status).toBe(404);
  });
});

// ─── Delete (Deactivate) Operator ─────────────────────────────────────────────

describe('DELETE /api/v1/operators/:id', () => {
  it('deactivates an operator', async () => {
    const token = await makeToken('Admin');

    (prisma.operator.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'op-1', name: 'Test', badgeId: 'B001', isActive: true,
    });
    (prisma.operator.update as jest.Mock).mockResolvedValueOnce({
      id: 'op-1', isActive: false,
    });

    const res = await request(app)
      .delete('/api/v1/operators/op-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('deactivated');
  });

  it('returns 404 for missing operator', async () => {
    const token = await makeToken('Admin');
    (prisma.operator.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .delete('/api/v1/operators/missing')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// ─── Bulk Import ──────────────────────────────────────────────────────────────

describe('POST /api/v1/operators/bulk-import', () => {
  it('imports operators from array', async () => {
    const token = await makeToken('Admin');

    (prisma.operator.findFirst as jest.Mock)
      .mockResolvedValueOnce(null) // First operator — no duplicate
      .mockResolvedValueOnce(null); // Second operator — no duplicate
    (prisma.operator.create as jest.Mock)
      .mockResolvedValueOnce({ id: 'op-1', name: 'Alice', badgeId: 'B200' })
      .mockResolvedValueOnce({ id: 'op-2', name: 'Bob', badgeId: 'B201' });

    const res = await request(app)
      .post('/api/v1/operators/bulk-import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        operators: [
          { name: 'Alice', badgeId: 'B200' },
          { name: 'Bob', badgeId: 'B201' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.results.imported).toBe(2);
    expect(res.body.results.skipped).toBe(0);
  });

  it('skips duplicates', async () => {
    const token = await makeToken('Admin');

    (prisma.operator.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: 'existing', name: 'Existing', badgeId: 'B001' }); // Duplicate

    const res = await request(app)
      .post('/api/v1/operators/bulk-import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        operators: [{ name: 'Dupe', badgeId: 'B001' }],
      });

    expect(res.status).toBe(200);
    expect(res.body.results.imported).toBe(0);
    expect(res.body.results.skipped).toBe(1);
  });
});
