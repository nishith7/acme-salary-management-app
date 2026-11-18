import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;
  const queryRaw = vi.fn();

  beforeAll(async () => {
    // Placeholder: PrismaService is replaced below, so nothing connects to it.
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: queryRaw })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    queryRaw.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health reports liveness without querying the database', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });

    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('GET /health/ready returns 200 when the database answers', async () => {
    queryRaw.mockResolvedValue([{ ok: 1 }]);

    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect({ status: 'ok', database: 'up' });
  });

  it('GET /health/ready returns 503 when the database is unreachable', async () => {
    queryRaw.mockRejectedValue(new Error('connect ETIMEDOUT'));

    const response = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);

    expect(response.body).toEqual({ status: 'error', database: 'down' });
  });
});
