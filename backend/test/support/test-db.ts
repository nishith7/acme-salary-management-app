import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';

export type Tx = Prisma.TransactionClient;

/** A Prisma client for integration tests, connected to DATABASE_URL (a migrated database). */
export function createTestPrisma(): PrismaClient {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run integration tests');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
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
      { timeout: 30_000, maxWait: 30_000 },
    );
  } catch (error) {
    if (!(error instanceof Rollback)) {
      throw error;
    }
  }
}
