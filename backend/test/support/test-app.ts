import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

/**
 * The signing secret every e2e app uses. It comes from vitest.config.e2e.ts,
 * which sets it before app.module.ts is imported. Not a real secret.
 */
export const TEST_JWT_SECRET = process.env['JWT_SECRET'] ?? '';

export interface TestApp {
  app: INestApplication<App>;
  /** Stand-in for PrismaService.$queryRaw. No real database is used in e2e tests. */
  queryRaw: ReturnType<typeof vi.fn>;
  /** Stand-in for prisma.user.findUnique. */
  findUser: ReturnType<typeof vi.fn>;
  /** Stand-in for prisma.refreshToken.create. */
  createRefreshToken: ReturnType<typeof vi.fn>;
}

/**
 * Boots the real AppModule with the same setup as main.ts, replacing only the
 * database client with a fake so tests are fast and deterministic.
 */
export async function createTestApp(): Promise<TestApp> {
  // PrismaService is replaced below, so nothing ever connects to a database.
  const queryRaw = vi.fn();
  const findUser = vi.fn();
  const createRefreshToken = vi.fn();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({
      $queryRaw: queryRaw,
      user: { findUnique: findUser },
      refreshToken: { create: createRefreshToken },
    })
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();

  return { app, queryRaw, findUser, createRefreshToken };
}
