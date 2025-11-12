import request from 'supertest';
import { app, server } from '../src/app';
import * as prismaMod from '../src/prisma/client';
import * as socketMod from '../src/sockets/workOrderSocket';
import { SignJWT } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'change-me');

function makeToken(sub: string, role: 'Tech'|'Supervisor'|'Admin') {
  return new SignJWT({ role }).setProtectedHeader({ alg: 'HS256' }).setSubject(sub).sign(secret);
}

describe('POST /complete', () => {
  const workOrderId = 'wo1';
  const stepId = 'st1';

  beforeAll(() => {
    jest.spyOn(socketMod, 'emitStepCompleted').mockImplementation(() => {});
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    server.close();
  });

  test('200 OK for Tech', async () => {
    jest.spyOn(prismaMod.prisma.step, 'findFirst').mockResolvedValue({
      id: stepId, workOrderId, title: 't', status: 'PENDING', notes: null, createdAt: new Date(), updatedAt: new Date()
    } as any);
    jest.spyOn(prismaMod.prisma.step, 'update').mockResolvedValue({
      id: stepId, workOrderId, title: 't', status: 'COMPLETED', notes: 'done', createdAt: new Date(), updatedAt: new Date()
    } as any);
    jest.spyOn(prismaMod.prisma.auditLog, 'create').mockResolvedValue({} as any);

    const token = await makeToken('u-tech', 'Tech');

    const res = await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/steps/${stepId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'done' });

    expect(res.status).toBe(200);
  });

  test('403 for Admin', async () => {
    const token = await makeToken('u-admin', 'Admin');
    const res = await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/steps/${stepId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });

  test('404 for invalid ids', async () => {
    jest.spyOn(prismaMod.prisma.step, 'findFirst').mockResolvedValue(null);
    const token = await makeToken('u-tech', 'Tech');
    const res = await request(app)
      .post(`/api/v1/work-orders/bad/steps/bad/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(404);
  });

  test('409 when already completed', async () => {
    jest.spyOn(prismaMod.prisma.step, 'findFirst').mockResolvedValue({
      id: stepId, workOrderId, title: 't', status: 'COMPLETED', notes: null, createdAt: new Date(), updatedAt: new Date()
    } as any);
    const token = await makeToken('u-tech', 'Tech');
    const res = await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/steps/${stepId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(409);
  });
});
