import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';

export type Tx = Prisma.TransactionClient;

/** A Prisma client for integration tests, connected to DATABASE_URL (a migrated database). */
export function createTestPrisma(): PrismaClient {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run integration tests');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * Lets a repository, which is written against PrismaService, run on a
 * transaction client instead. A transaction client has the same model methods
 * (`user`, `refreshToken`, ...), which is all a repository uses.
 */
export function asPrismaService(tx: Tx): PrismaService {
  // A repository that owns a transaction calls `$transaction`, which a transaction client
  // does not have (transactions do not nest). Here it runs its work on the same client, so
  // the test sees everything the repository wrote and still rolls it all back at the end.
  // What this cannot show is the repository's own rollback on failure: that is the database's
  // job, and is not tested here. Functions are bound to the real client because Prisma's
  // methods depend on `this`.
  return new Proxy(tx, {
    get(target, property) {
      if (property === '$transaction') {
        return (work: (client: Tx) => Promise<unknown>) => work(target);
      }
      const value: unknown = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as unknown as PrismaService;
}

class Rollback extends Error {}

/**
 * Runs `work` inside a transaction that is ALWAYS rolled back, so a test can
 * write freely and leaves no data behind in the shared database.
 */
export async function inRollback(
  prisma: PrismaClient,
  work: (tx: Tx) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await work(tx);
        throw new Rollback('rollback');
      },
      { timeout: 60_000, maxWait: 30_000 },
    );
  } catch (error) {
    if (!(error instanceof Rollback)) {
      throw error;
    }
  }
}
