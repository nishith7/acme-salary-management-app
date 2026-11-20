import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { DEFAULT_EMPLOYEE_COUNT, seedEmployees } from './seed-employees.js';
import { seedSalaryHistory } from './seed-salaries.js';

/**
 * Command line entry for the seed. Run it with `npm run seed`; add
 * `-- --count=500` for a smaller set. It loads the reference data and the
 * employees, then the salary history of those employees. It prints counts and
 * timings only, never a connection string.
 *
 * It uses DIRECT_URL (the direct connection, as the architecture says for the
 * seed) and falls back to DATABASE_URL if only that is set.
 */
async function main(): Promise<void> {
  const count = parseCount(process.argv.slice(2));

  const usesDirect = Boolean(process.env['DIRECT_URL']);
  const connectionString =
    process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('Set DIRECT_URL (or DATABASE_URL) to the database to seed');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    console.log(
      `Seeding ${count} employees using ${usesDirect ? 'DIRECT_URL' : 'DATABASE_URL (pooled)'}...`,
    );
    const started = performance.now();

    const result = await seedEmployees(prisma, { count });

    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    console.log(
      `Done in ${seconds}s. Countries created: ${result.countriesCreated}, departments created: ${result.departmentsCreated}, ` +
        `employees created: ${result.employeesCreated}, already present and left unchanged: ${result.employeesSkipped}.`,
    );

    console.log(`Seeding the salary history of those ${count} employees...`);
    const salaryStarted = performance.now();

    const salaries = await seedSalaryHistory(prisma, { count });

    const salarySeconds = ((performance.now() - salaryStarted) / 1000).toFixed(
      1,
    );
    console.log(
      `Done in ${salarySeconds}s. Employees given a history: ${salaries.employeesSeeded} (${salaries.salaryRecordsCreated} salary records), ` +
        `already had one and left unchanged: ${salaries.employeesAlreadyHadHistory}, not found: ${salaries.employeesNotFound}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

/** Reads `--count=N`. Anything else is an error, so a typo cannot quietly seed 10,000 rows. */
function parseCount(args: string[]): number {
  let count = DEFAULT_EMPLOYEE_COUNT;
  for (const arg of args) {
    const match = /^--count=(\d+)$/.exec(arg);
    if (!match) {
      throw new Error(
        `Unknown argument "${arg}". The only option is --count=<whole number>`,
      );
    }
    count = Number(match[1]);
  }
  return count;
}

try {
  await main();
} catch (error) {
  console.error(
    `Seed failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
