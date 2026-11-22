import { EmployeesRepository } from '../src/employees/employees.repository.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import {
  asPrismaService,
  createTestPrisma,
  inRollback,
  type Tx,
} from './support/test-db.js';

/**
 * The directory's summary cards against the real database: the headcount of everyone who
 * matches, and the total, median and average pay of the current people among them, in US
 * dollars. Every test is rolled back. The data is made up (countries XD and XE, currency XTS
 * at 2 per US dollar) and every query is limited to those countries, so the tests pass
 * whether or not the database has been seeded.
 */
describe('EmployeesRepository.summary (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const today = new Date('2026-11-20T00:00:00.000Z');
  const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  /**
   * XD: six current people paid 40,000 50,000 60,000 70,000 80,000 and 190,000 US dollars (so
   * the average and the median differ), plus one person who has left (paid far more, must not
   * count towards the money) and one current person with no salary (counted as a person, not
   * in the money). XE: four current people, too few for any figure.
   */
  async function seedSummary(tx: Tx) {
    const xd = await tx.country.create({
      data: { code: 'XD', name: 'Test Country D', currencyCode: 'XTS' },
    });
    const xe = await tx.country.create({
      data: { code: 'XE', name: 'Test Country E', currencyCode: 'XTS' },
    });
    const department = await tx.department.create({
      data: { name: 'Test Department Sum' },
    });
    await tx.fxRate.create({
      data: {
        currencyCode: 'XTS',
        validFrom: date('2011-01-01'),
        unitsPerUsd: '2',
      },
    });

    let n = 0;
    const person = async (
      countryId: string,
      usd: number | null,
      status: 'ACTIVE' | 'TERMINATED' = 'ACTIVE',
    ) => {
      n += 1;
      const employee = await tx.employee.create({
        data: {
          employeeCode: `EMPTEST-S${String(n).padStart(3, '0')}`,
          fullName: `Person ${n}`,
          gender: 'OTHER',
          jobTitle: 'Tester',
          level: 3,
          countryId,
          departmentId: department.id,
          joiningDate: date('2020-01-01'),
          status,
          terminatedOn: status === 'TERMINATED' ? date('2025-01-01') : null,
        },
      });
      if (usd !== null) {
        await tx.salaryRecord.create({
          data: {
            employeeId: employee.id,
            annualAmount: `${usd * 2}`,
            currencyCode: 'XTS',
            effectiveFrom: date('2020-01-01'),
          },
        });
      }
    };

    for (const usd of [40000, 50000, 60000, 70000, 80000, 190000]) {
      await person(xd.id, usd);
    }
    await person(xd.id, 4500000, 'TERMINATED');
    await person(xd.id, null);
    for (const usd of [100000, 110000, 120000, 130000]) {
      await person(xe.id, usd);
    }
  }

  it('counts everyone who matches, and works out the total, median and average of the current people with a salary, in US dollars', () =>
    inRollback(prisma, async (tx) => {
      await seedSummary(tx);
      const repository = new EmployeesRepository(asPrismaService(tx));

      const summary = await repository.summary({ countries: ['XD'] }, today);

      expect(summary).toEqual({
        headcount: 8,
        counted: 6,
        totalAnnualUsd: '490000.00',
        medianUsd: '65000.00',
        averageUsd: '81666.67',
      });
    }));

  it('gives no money for fewer than 5 current people, whatever else matches, and still counts the people', () =>
    inRollback(prisma, async (tx) => {
      await seedSummary(tx);
      const repository = new EmployeesRepository(asPrismaService(tx));

      const fourCurrent = await repository.summary(
        { countries: ['XE'] },
        today,
      );
      const onlyLeavers = await repository.summary(
        { countries: ['XD'], statuses: ['TERMINATED'] },
        today,
      );

      expect(fourCurrent).toEqual({
        headcount: 4,
        counted: 4,
        totalAnnualUsd: null,
        medianUsd: null,
        averageUsd: null,
      });
      expect(onlyLeavers).toEqual({
        headcount: 1,
        counted: 0,
        totalAnnualUsd: null,
        medianUsd: null,
        averageUsd: null,
      });
    }));

  it('follows the directory filters, for example a search that matches nobody', () =>
    inRollback(prisma, async (tx) => {
      await seedSummary(tx);
      const repository = new EmployeesRepository(asPrismaService(tx));

      const summary = await repository.summary(
        { countries: ['XD', 'XE'], search: 'no such person anywhere' },
        today,
      );

      expect(summary).toEqual({
        headcount: 0,
        counted: 0,
        totalAnnualUsd: null,
        medianUsd: null,
        averageUsd: null,
      });
    }));
});
