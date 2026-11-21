import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app.js';

// CORS_ORIGINS is not set here, so this is the default: nothing is allowed.
describe('CORS (e2e), with no site listed', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('gives no site permission, not even a local one, until it is listed', async () => {
    const response = await request(testApp.app.getHttpServer())
      .options('/employees')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'QUERY');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(
      response.headers['access-control-allow-credentials'],
    ).toBeUndefined();
  });
});
