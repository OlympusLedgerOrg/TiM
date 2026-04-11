// Ensure JWT secret is set before auth middleware is loaded
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
// Socket emitter mocked before app import
jest.mock('../src/sockets/workOrderSocket', () => ({
    emitStepCompleted: jest.fn(),
    emitQueueUpdated: jest.fn(),
}));
// Prisma mocked BEFORE importing app to avoid real DB calls.
const m = {
    workCenter: { findMany: jest.fn() },
};
jest.mock('../src/prisma/client', () => ({ prisma: m }));
import request from 'supertest';
import { app, server } from '../src/app';
import { SignJWT } from 'jose';
async function makeToken(role, tenantId = 'default') {
    const key = new TextEncoder().encode(process.env.JWT_SECRET);
    return new SignJWT({ sub: 'user-1', role, tenantId })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(key);
}
describe('GET /api/v1/queue', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    afterAll(async () => {
        try {
            server.close();
        }
        catch (_) { }
    });
    test('returns 200 with workCenters array', async () => {
        m.workCenter.findMany.mockResolvedValue([
            {
                id: 'wc-1',
                code: 'MIX-01',
                name: 'Mixing',
                batches: [
                    {
                        id: 'batch-1',
                        lotNumber: 'LOT-001',
                        quantity: 500,
                        status: 'IN_QUEUE',
                        createdAt: new Date('2024-01-01T10:00:00Z'),
                        material: { description: 'EPDM Compound 70A' },
                    },
                ],
            },
            {
                id: 'wc-2',
                code: 'EXT-01',
                name: 'Extrusion',
                batches: [],
            },
        ]);
        const token = await makeToken('Tech');
        const res = await request(app)
            .get('/api/v1/queue')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.workCenters).toHaveLength(2);
        expect(res.body.workCenters[0]).toHaveProperty('id', 'wc-1');
        expect(res.body.workCenters[0]).toHaveProperty('code', 'MIX-01');
        expect(res.body.workCenters[0]).toHaveProperty('batchCount', 1);
        expect(res.body.workCenters[0].batches).toHaveLength(1);
        expect(res.body.workCenters[0].batches[0]).toHaveProperty('lotNumber', 'LOT-001');
    });
    test('returns 401 without token', async () => {
        const res = await request(app).get('/api/v1/queue');
        expect(res.status).toBe(401);
    });
    test('returns empty array when no work centers', async () => {
        m.workCenter.findMany.mockResolvedValue([]);
        const token = await makeToken('Tech');
        const res = await request(app)
            .get('/api/v1/queue')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.workCenters).toEqual([]);
    });
});
