// Ensure JWT secret is set before auth middleware is loaded
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
// Socket emitter mocked before app import
jest.mock('../src/sockets/workOrderSocket', () => ({
    emitStepCompleted: jest.fn(),
}));
// Prisma mocked BEFORE importing app to avoid real DB calls.
const m = {
    step: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    workOrderStep: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
    $queryRaw: jest.fn(),
};
jest.mock('../src/prisma/client', () => ({ prisma: m }));
import request from 'supertest';
import { app, server } from '../src/app';
import { SignJWT } from 'jose';
const url = (wo = 'wo-1', st = 'st-1') => `/api/v1/work-orders/${wo}/steps/${st}/complete`;
async function makeToken(role) {
    const key = new TextEncoder().encode(process.env.JWT_SECRET);
    return new SignJWT({ sub: 'user-1', role })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(key);
}
const stepApi = () => m.step;
describe('POST /complete', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    afterAll(async () => {
        try {
            server.close();
        }
        catch (_) { }
    });
    test('200 OK for Tech', async () => {
        stepApi().findFirst.mockResolvedValue({ id: 'st-1', status: 'PENDING', workOrderId: 'wo-1' });
        stepApi().update.mockResolvedValue({ id: 'st-1', status: 'COMPLETED', workOrderId: 'wo-1' });
        m.auditLog.create.mockResolvedValue({ id: 'audit-1' });
        const token = await makeToken('Tech');
        const res = await request(app).post(url()).set('Authorization', `Bearer ${token}`).send({ notes: 'done' });
        expect(res.status).toBe(200);
    });
    test('403 for Admin', async () => {
        const token = await makeToken('Admin');
        const res = await request(app).post(url()).set('Authorization', `Bearer ${token}`).send({});
        expect(res.status).toBe(403);
    });
    test('404 for invalid ids', async () => {
        stepApi().findFirst.mockResolvedValue(null);
        const token = await makeToken('Tech');
        const res = await request(app).post(url('wo-missing', 'st-missing')).set('Authorization', `Bearer ${token}`).send({});
        expect(res.status).toBe(404);
    });
    test('409 when already completed', async () => {
        stepApi().findFirst.mockResolvedValue({ id: 'st-1', status: 'COMPLETED', workOrderId: 'wo-1' });
        const token = await makeToken('Tech');
        const res = await request(app).post(url()).set('Authorization', `Bearer ${token}`).send({});
        expect(res.status).toBe(409);
    });
});
