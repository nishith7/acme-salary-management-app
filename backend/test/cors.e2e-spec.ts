import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app.js';

// Runs before the imports above: the environment is validated as soon as
// app.module.ts loads. Each test file runs in its own worker, so this does not
// leak into other specs. The case with no sites listed is in cors-off.
vi.hoisted(() => {
  process.env['CORS_ORIGINS'] = 'http://localhost:5173, https://hr.example.com';
});

describe('CORS (e2e), with sites listed', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  const preflight = (origin: string) =>
    request(testApp.app.getHttpServer())
      .options('/employees')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'QUERY')
      .set('Access-Control-Request-Headers', 'authorization,content-type');

  it('lets a listed site send the directory request: the browser checks QUERY, the token and the JSON body first', async () => {
    const response = await preflight('http://localhost:5173').expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(response.headers['access-control-allow-methods']).toContain('QUERY');
    const allowedHeaders = response.headers['access-control-allow-headers']!;
    expect(allowedHeaders.toLowerCase()).toContain('authorization');
    expect(allowedHeaders.toLowerCase()).toContain('content-type');
  });

  it('allows the refresh cookie to travel with calls from a listed site', async () => {
    const response = await preflight('https://hr.example.com').expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(
      'https://hr.example.com',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('remembers the preflight answer for 10 minutes, so it is not repeated before every call', async () => {
    const response = await preflight('http://localhost:5173');

    expect(response.headers['access-control-max-age']).toBe('600');
  });

  it('lets a listed site read the answer to a real call, which is how the login response and its cookie reach the page', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('gives a site that is not listed no permission at all', async () => {
    const response = await preflight('https://evil.example.com');

    // The permission is the allow-origin header. The library also sends allow-credentials
    // here, but a browser grants nothing without a matching allow-origin.
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
