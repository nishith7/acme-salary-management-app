import { INestApplication, type Type } from '@nestjs/common';
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
  /** Stand-in for prisma.user.findUnique, whether by email or by id. */
  findUser: ReturnType<typeof vi.fn>;
  /** Stand-in for prisma.refreshToken.create, inside a transaction or not. */
  createRefreshToken: ReturnType<typeof vi.fn>;
  /** Stand-in for prisma.refreshToken.findUnique. */
  findRefreshToken: ReturnType<typeof vi.fn>;
  /** Stand-in for prisma.refreshToken.updateMany, inside a transaction or not. */
  updateRefreshTokens: ReturnType<typeof vi.fn>;
  /** Stand-in for prisma.country.findMany. */
  findCountries: ReturnType<typeof vi.fn>;
  /** Stand-in for prisma.department.findMany. */
  findDepartments: ReturnType<typeof vi.fn>;
  /** Stand-in for prisma.employee.findUnique. */
  findEmployee: ReturnType<typeof vi.fn>;
  /** Stand-in for prisma.salaryRecord.findFirst. */
  findSalaryRecord: ReturnType<typeof vi.fn>;
  /** Stand-in for prisma.salaryRecord.create. */
  createSalaryRecord: ReturnType<typeof vi.fn>;
  /** Stand-in for prisma.salaryRecord.createMany, inside a transaction or not. */
  createManySalaryRecords: ReturnType<typeof vi.fn>;
  /** Stand-in for prisma.import.create, inside a transaction or not. */
  createImport: ReturnType<typeof vi.fn>;
}

/**
 * Boots the real AppModule with the same setup as main.ts, replacing only the
 * database client with a fake so tests are fast and deterministic.
 *
 * `controllers` adds test-only controllers next to the real ones, to prove
 * behaviour no real route shows yet (for example a route restricted to one
 * role). The global guards apply to them exactly as to real controllers.
 */
export async function createTestApp(
  options: { controllers?: Type<unknown>[] } = {},
): Promise<TestApp> {
  // PrismaService is replaced below, so nothing ever connects to a database.
  const queryRaw = vi.fn();
  const findUser = vi.fn();
  const createRefreshToken = vi.fn();
  const findRefreshToken = vi.fn();
  const updateRefreshTokens = vi.fn();
  const findCountries = vi.fn();
  const findDepartments = vi.fn();
  const findEmployee = vi.fn();
  const findSalaryRecord = vi.fn();
  const createSalaryRecord = vi.fn();
  const createManySalaryRecords = vi.fn();
  const createImport = vi.fn();

  const prisma = {
    $queryRaw: queryRaw,
    user: { findUnique: findUser },
    country: { findMany: findCountries },
    department: { findMany: findDepartments },
    employee: { findUnique: findEmployee },
    salaryRecord: {
      findFirst: findSalaryRecord,
      create: createSalaryRecord,
      createMany: createManySalaryRecords,
    },
    import: { create: createImport },
    refreshToken: {
      create: createRefreshToken,
      findUnique: findRefreshToken,
      updateMany: updateRefreshTokens,
    },
    // The fake transaction runs its work on the same fakes, so a test sees
    // every call whether or not the code under test wrapped it in a transaction.
    $transaction: (work: (tx: unknown) => Promise<unknown>) => work(prisma),
  };
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();

  return {
    app,
    queryRaw,
    findUser,
    createRefreshToken,
    findRefreshToken,
    updateRefreshTokens,
    findCountries,
    findDepartments,
    findEmployee,
    findSalaryRecord,
    createSalaryRecord,
    createManySalaryRecords,
    createImport,
  };
}
