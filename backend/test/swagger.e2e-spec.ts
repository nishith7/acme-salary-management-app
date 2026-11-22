import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app.js';

interface JsonSchema {
  type?: string;
  format?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  description?: string;
  example?: unknown;
}

interface Operation {
  tags: string[];
  responses: Record<
    string,
    { content?: Record<string, { schema?: JsonSchema }> }
  >;
  requestBody?: { content?: Record<string, { schema?: JsonSchema }> };
  security?: Record<string, string[]>[];
}

interface OpenApiDocument {
  info: { title: string };
  paths: Record<string, Partial<Record<'get' | 'post' | 'query', Operation>>>;
  components: {
    schemas: Record<string, unknown>;
    securitySchemes?: Record<
      string,
      { type?: string; scheme?: string; bearerFormat?: string }
    >;
  };
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

    // At OpenAPI 3.0 and 3.1 Swagger silently leaves out routes that use the HTTP
    // QUERY method, so this fails if the document is not 3.2.
    it('documents QUERY /employees with its JSON body and bearer token', () => {
      const operation = document.paths['/employees']?.query;

      expect(operation?.tags).toEqual(['Employees']);
      // The sample Swagger pre-fills in "Try it out", instead of "string" placeholders.
      expect(
        operation?.requestBody?.content?.['application/json']?.schema?.example,
      ).toMatchObject({ countries: ['IN', 'US'], pageSize: 25 });
      expect(operation?.security).toEqual([{ bearer: [] }]);
    });

    it('takes the login body from the Zod schema: a required email and password', () => {
      const schema =
        document.paths['/auth/login']?.post?.requestBody?.content?.[
          'application/json'
        ]?.schema;

      expect(schema?.type).toBe('object');
      expect(schema?.required?.sort()).toEqual(['email', 'password']);
      expect(schema?.properties?.['email']?.format).toBe('email');
      expect(schema?.properties?.['password']?.description).toContain('128');
    });

    describe('authentication', () => {
      it('declares a bearer JWT security scheme, and marks a protected route as needing it', () => {
        expect(document.components.securitySchemes?.['bearer']).toEqual({
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        });
        expect(document.paths['/auth/me']?.get?.security).toEqual([
          { bearer: [] },
        ]);
      });

      it('does not mark the public routes as needing it', () => {
        for (const [path, method] of [
          ['/health', 'get'],
          ['/health/ready', 'get'],
          ['/auth/login', 'post'],
          ['/auth/refresh', 'post'],
          ['/auth/logout', 'post'],
        ] as const) {
          expect(document.paths[path]?.[method]?.security).toBeUndefined();
        }
      });
    });
  });
});
