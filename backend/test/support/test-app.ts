import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export interface TestApp {
  app: INestApplication<App>;
  /** Stand-in for PrismaService.$queryRaw. No real database is used in e2e tests. */
  queryRaw: ReturnType<typeof vi.fn>;
}

/**
 * Boots the real AppModule with the same setup as main.ts, replacing only the
 * database client with a fake so tests are fast and deterministic.
 */
export async function createTestApp(): Promise<TestApp> {
  // Placeholder: PrismaService is replaced below, so nothing ever connects to it.
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';

  const queryRaw = vi.fn();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({ $queryRaw: queryRaw })
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();

  return { app, queryRaw };
}
