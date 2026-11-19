import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app.js';

interface JsonSchema {
  type?: string;
  format?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  description?: string;
}

interface Operation {
  tags: string[];
  responses: Record<
    string,
    { content?: Record<string, { schema?: JsonSchema }> }
  >;
  requestBody?: { content?: Record<string, { schema?: JsonSchema }> };
}

interface OpenApiDocument {
  info: { title: string };
  paths: Record<string, Partial<Record<'get' | 'post', Operation>>>;
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

    describe('POST /auth/login', () => {
      const operation = () => document.paths['/auth/login']?.post;

      it('is documented under the Auth tag with 200, 400 and 401 responses', () => {
        expect(operation()?.tags).toEqual(['Auth']);
        expect(Object.keys(operation()?.responses ?? {}).sort()).toEqual([
          '200',
          '400',
          '401',
        ]);
      });

      it('takes a JSON body with a required email and password, taken from the Zod schema', () => {
        const schema =
          operation()?.requestBody?.content?.['application/json']?.schema;

        expect(schema?.type).toBe('object');
        expect(schema?.required?.sort()).toEqual(['email', 'password']);
        expect(schema?.properties?.['email']?.format).toBe('email');
        expect(schema?.properties?.['password']?.type).toBe('string');
        expect(schema?.properties?.['password']?.description).toContain('128');
      });

      it('returns the access token, its lifetime and the user, taken from the Zod schema', () => {
        const schema =
          operation()?.responses['200']?.content?.['application/json']?.schema;

        expect(Object.keys(schema?.properties ?? {}).sort()).toEqual([
          'accessToken',
          'expiresIn',
          'user',
        ]);
        expect(
          Object.keys(schema?.properties?.['user']?.properties ?? {}).sort(),
        ).toEqual(['email', 'id', 'name', 'role']);
      });
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
