import request from 'supertest';
import { app, server } from '../src/app';

describe('GET /health', () => {
  afterAll(async () => {
    server.close();
  });

  test('should return health status', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(503); // Will be 503 without DB, but endpoint exists
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('database');
  });
});
