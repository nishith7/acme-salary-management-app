import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('Health (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(() => {
    testApp.queryRaw.mockReset();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('GET /health reports liveness without querying the database', async () => {
    await request(testApp.app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });

    expect(testApp.queryRaw).not.toHaveBeenCalled();
  });

  it('GET /health/ready returns 200 when the database answers', async () => {
    testApp.queryRaw.mockResolvedValue([{ ok: 1 }]);

    await request(testApp.app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect({ status: 'ok', database: 'up' });
  });

  it('GET /health/ready returns 503 when the database is unreachable', async () => {
    testApp.queryRaw.mockRejectedValue(new Error('connect ETIMEDOUT'));

    const response = await request(testApp.app.getHttpServer())
      .get('/health/ready')
      .expect(503);

    expect(response.body).toEqual({ status: 'error', database: 'down' });
  });
});
