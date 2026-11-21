import type { PrismaClient } from '../src/generated/prisma/client.js';
import { InsightsRepository } from '../src/insights/insights.repository.js';
import {
  asPrismaService,
  createTestPrisma,
  inRollback,
  type Tx,
} from './support/test-db.js';

/**
 * Pay figures against the real database: medians and percentiles worked out in SQL, in US
 * dollars, for current employees only. Every test is rolled back. The data is made up
 * (countries XA and XB, currency XTS at 2 per US dollar), and every query is limited to those
 * countries, so the tests pass whether or not the database has been seeded.
 */
describe('InsightsRepository.payBy (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const today = new Date('2026-11-20T00:00:00.000Z');
  const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const ofTestCountries = { countries: ['XA', 'XB'] };

  /**
   * XA: six current people in "Test Department Ins1", all level 3, paid 80,000 to 180,000 XTS
   * (40,000 to 90,000 US dollars, in steps of 10,000), plus
   *  - someone who has left, paid far more (must not count anywhere),
   *  - a current person with no salary at all, and one paid in a currency with no exchange
   *    rate (both are left out of the figures and counted as excluded).
   * XB: four current people in "Test Department Ins2", level 3, paid 100,000 to 130,000 US
   * dollars: too few for a group of their own.
   */
  async function seedPay(tx: Tx) {
    const xa = await tx.country.create({
      data: { code: 'XA', name: 'Test Country A', currencyCode: 'XTS' },
    });
    const xb = await tx.country.create({
      data: { code: 'XB', name: 'Test Country B', currencyCode: 'XTS' },
    });
    const xc = await tx.country.create({
      data: { code: 'XC', name: 'Test Country C', currencyCode: 'XTS' },
    });
    const one = await tx.department.create({
      data: { name: 'Test Department Ins1' },
    });
    const two = await tx.department.create({
      data: { name: 'Test Department Ins2' },
    });
    await tx.fxRate.create({
      data: {
        currencyCode: 'XTS',
        validFrom: date('2010-01-01'),
        unitsPerUsd: '2',
      },
    });

    let n = 0;
    const person = async (
      countryId: string,
      departmentId: string,
      pay: { amount: string; currency: string } | null,
      status: 'ACTIVE' | 'TERMINATED' = 'ACTIVE',
    ) => {
      n += 1;
      const employee = await tx.employee.create({
        data: {
          employeeCode: `EMPTEST-I${String(n).padStart(3, '0')}`,
          fullName: `Person ${n}`,
          gender: 'OTHER',
          jobTitle: 'Tester',
          level: 3,
          countryId,
          departmentId,
          joiningDate: date('2020-01-01'),
          status,
          terminatedOn: status === 'TERMINATED' ? date('2025-01-01') : null,
        },
      });
      if (pay) {
        await tx.salaryRecord.create({
          data: {
            employeeId: employee.id,
            annualAmount: pay.amount,
            currencyCode: pay.currency,
            effectiveFrom: date('2020-01-01'),
          },
        });
      }
    };

    for (const usd of [40, 50, 60, 70, 80, 90]) {
      await person(xa.id, one.id, { amount: `${usd * 2000}`, currency: 'XTS' });
    }
    await person(
      xa.id,
      one.id,
      { amount: '9000000', currency: 'XTS' },
      'TERMINATED',
    );
    await person(xa.id, one.id, null);
    await person(xa.id, one.id, { amount: '70000', currency: 'XTQ' });
    // XC: exactly five people, each paid 50,000 US dollars: the smallest group that may be shown.
    for (let i = 0; i < 5; i++) {
      await person(xc.id, one.id, { amount: '100000', currency: 'XTS' });
    }
    for (const usd of [100, 110, 120, 130]) {
      await person(xb.id, two.id, { amount: `${usd * 2000}`, currency: 'XTS' });
    }
  }

  it('works out the median and quartiles of a group between the two middle values, in US dollars, for current people only', () =>
    inRollback(prisma, async (tx) => {
      await seedPay(tx);
      const repository = new InsightsRepository(asPrismaService(tx));

      const { groups } = await repository.payBy(
        'country',
        { countries: ['XA'] },
        today,
      );

      expect(groups).toEqual([
        {
          key: 'XA',
          label: 'Test Country A',
          headcount: 6,
          // 6 values: the median is halfway between the 3rd and the 4th, and the quartiles
          // sit a quarter and three quarters of the way along.
          p25: '52500.00',
          median: '65000.00',
          p75: '77500.00',
          total: '390000.00',
        },
      ]);
    }));

  it('gives no figures for a group of fewer than 5 people, only that it exists, and counts the people it could not use', () =>
    inRollback(prisma, async (tx) => {
      await seedPay(tx);
      const repository = new InsightsRepository(asPrismaService(tx));

      const { groups, overall } = await repository.payBy(
        'country',
        ofTestCountries,
        today,
      );

      const xb = groups.find((g) => g.key === 'XB');
      expect(xb).toEqual({
        key: 'XB',
        label: 'Test Country B',
        headcount: 4,
        p25: null,
        median: null,
        p75: null,
        total: null,
      });
      // Everyone together: 10 people paid 40,000 to 130,000, and the 2 who could not be
      // converted to dollars are counted but left out of the figures.
      expect(overall).toEqual({
        headcount: 10,
        p25: '62500.00',
        median: '85000.00',
        p75: '107500.00',
        total: '850000.00',
        excluded: 2,
      });
    }));

  it('groups by department and by level as well, and filters by department and level', () =>
    inRollback(prisma, async (tx) => {
      await seedPay(tx);
      const repository = new InsightsRepository(asPrismaService(tx));

      const byDepartment = await repository.payBy(
        'department',
        ofTestCountries,
        today,
      );
      const byLevel = await repository.payBy('level', ofTestCountries, today);
      const filtered = await repository.payBy(
        'country',
        {
          ...ofTestCountries,
          departments: ['Test Department Ins2'],
          levels: [3],
        },
        today,
      );

      expect(
        byDepartment.groups.map((g) => [
          g.label,
          g.headcount,
          g.median !== null,
        ]),
      ).toEqual([
        ['Test Department Ins1', 6, true],
        ['Test Department Ins2', 4, false],
      ]);
      // Both countries are level 3: one group of all ten.
      expect(byLevel.groups).toEqual([
        expect.objectContaining({ key: '3', label: 'Level 3', headcount: 10 }),
      ]);
      expect(filtered.groups.map((g) => g.key)).toEqual(['XB']);
    }));

  it('has nothing to say about a filter that matches nobody', () =>
    inRollback(prisma, async (tx) => {
      await seedPay(tx);
      const repository = new InsightsRepository(asPrismaService(tx));

      const { groups, overall } = await repository.payBy(
        'country',
        { countries: ['XA'], levels: [9] },
        today,
      );

      expect(groups).toEqual([]);
      expect(overall).toMatchObject({
        headcount: 0,
        median: null,
        total: null,
      });
    }));

  it('shows a group of exactly 5 people and not a group of 4', () =>
    inRollback(prisma, async (tx) => {
      await seedPay(tx);
      const repository = new InsightsRepository(asPrismaService(tx));

      const { groups } = await repository.payBy(
        'country',
        { countries: ['XB', 'XC'] },
        today,
      );

      const byKey = new Map(groups.map((g) => [g.key, g]));
      expect(byKey.get('XC')).toMatchObject({
        headcount: 5,
        median: '50000.00',
        total: '250000.00',
      });
      expect(byKey.get('XB')).toMatchObject({ headcount: 4, median: null });
    }));
});
