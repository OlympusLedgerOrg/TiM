/**
 * Auth API Tests — Login for supervisors/managers (bcrypt password hashing)
 */

process.env.RATE_LIMIT_AUTH = '100';

// Mock Prisma before any imports
jest.mock('../src/prisma/client', () => {
  const mockPrisma = {
    $queryRaw: jest.fn(),
    user: {
      findUnique: jest.fn(),
    },
  };
  return { prisma: mockPrisma };
});

import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../src/app';
import { prisma } from '../src/prisma/client';

describe('POST /api/v1/auth/login', () => {
  const testPassword = 'SecurePass123!';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(testPassword, 10);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 for missing credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'super@test.com' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: testPassword });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: testPassword });
    expect(res.status).toBe(400);
  });

  it('returns 401 for unknown email', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'unknown@example.com', password: testPassword });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Invalid');
  });

  it('returns 401 for wrong password', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'user-1', email: 'super@test.com', name: 'Super', role: 'Supervisor',
      tenantId: 'tenant-1', isActive: true, passwordHash,
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'super@test.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Invalid');
  });

  it('returns 401 for inactive user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'user-1', email: 'inactive@test.com', name: 'Inactive', role: 'Supervisor',
      tenantId: 'tenant-1', isActive: false, passwordHash,
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'inactive@test.com', password: testPassword });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Invalid');
  });

  it('returns 401 for user without passwordHash (badge-only worker)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'user-2', email: 'worker@test.com', name: 'Worker', role: 'Tech',
      tenantId: 'tenant-1', isActive: true, passwordHash: null,
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'worker@test.com', password: 'anything' });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Invalid');
  });

  it('returns token for valid login', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'user-1', email: 'super@test.com', name: 'Supervisor',
      role: 'Supervisor', tenantId: 'tenant-1', isActive: true, passwordHash,
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'super@test.com', password: testPassword });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('super@test.com');
    expect(res.body.user.role).toBe('Supervisor');
  });

  it('returns a sanitized 500 response for unexpected errors', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (prisma.user.findUnique as jest.Mock).mockRejectedValueOnce(new Error('database exploded'));

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'super@test.com', password: testPassword });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Internal server error' });
    consoleErrorSpy.mockRestore();
  });

  it('token contains correct claims (sub, role, tenantId, name)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'user-1', email: 'admin@test.com', name: 'Admin User',
      role: 'Admin', tenantId: 'tenant-1', isActive: true, passwordHash,
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: testPassword });

    expect(res.status).toBe(200);
    const token = res.body.token;
    const payload = JSON.parse(atob(token.split('.')[1]));
    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('Admin');
    expect(payload.tenantId).toBe('tenant-1');
    expect(payload.name).toBe('Admin User');
    expect(payload.exp).toBeDefined();
  });
});
