import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app.js';

interface OpenApiDocument {
  info: { title: string };
  paths: Record<
    string,
    { get: { tags: string[]; responses: Record<string, unknown> } }
  >;
  components: { schemas: Record<string, unknown> };
}

describe('Swagger (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('serves the Swagger UI at /docs', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/docs')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/html');
  });

  describe('OpenAPI document at /docs-json', () => {
    let document: OpenApiDocument;

    beforeAll(async () => {
      const response = await request(testApp.app.getHttpServer())
        .get('/docs-json')
        .expect(200);
      document = response.body as OpenApiDocument;
    });

    it('is titled for this API', () => {
      expect(document.info.title).toBe('ACME Salary Management API');
    });

    it('documents GET /health under the Health tag with a 200 response', () => {
      const operation = document.paths['/health']?.get;

      expect(operation?.tags).toEqual(['Health']);
      expect(Object.keys(operation?.responses ?? {})).toEqual(['200']);
    });

    it('documents GET /health/ready with 200 and 503 responses', () => {
      const operation = document.paths['/health/ready']?.get;

      expect(operation?.tags).toEqual(['Health']);
      expect(Object.keys(operation?.responses ?? {}).sort()).toEqual([
        '200',
        '503',
      ]);
    });

    it('describes the response bodies as schemas', () => {
      expect(Object.keys(document.components.schemas).sort()).toEqual([
        'LivenessResponse',
        'ReadinessErrorResponse',
        'ReadinessResponse',
      ]);
    });
  });
});
