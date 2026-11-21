import type { PrismaClient } from '../src/generated/prisma/client.js';
import { EmployeesRepository } from '../src/employees/employees.repository.js';
import {
  asPrismaService,
  createTestPrisma,
  inRollback,
  type Tx,
} from './support/test-db.js';

/**
 * One employee's profile against the real database: the row (the same one the
 * directory shows) and the salary history with what changed at each step. Every
 * test is rolled back. The data is made up: country XP, department "Test
 * Department Profile", employee codes EMPTEST-P..., so the tests pass whether or
 * not the database has been seeded.
 */
describe('EmployeesRepository profile queries (integration)', () => {
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
   * Country XP (currency XTS, 2 per US dollar, band 100,000 to 150,000 at level 3),
   * a user "Hana Tester", and two people:
   *
   * Quin  one salary of 90,000 XTS: 45,000 USD, below the band.
   * Pia   hired on 80,000, then (all XTS unless said) a merit raise to 88,000, a
   *       promotion to 110,000 on 2025-04-01, a correction of that to 112,000 on the
   *       same date entered a month later, a move to another currency (9,000,000 XTT)
   *       on 2026-01-01, and a raise to 9,500,000 XTT dated in the future.
   */
  async function seedProfiles(tx: Tx) {
    const country = await tx.country.create({
      data: { code: 'XP', name: 'Test Country P', currencyCode: 'XTS' },
    });
    const department = await tx.department.create({
      data: { name: 'Test Department Profile' },
    });
    await tx.fxRate.create({
      data: {
        currencyCode: 'XTS',
        validFrom: date('2010-01-01'),
        unitsPerUsd: '2',
      },
    });
    await tx.salaryBand.create({
      data: {
        countryId: country.id,
        level: 3,
        minAmount: '100000',
        maxAmount: '150000',
      },
    });
    const hana = await tx.user.create({
      data: {
        email: 'hana.tester@profile-test.invalid',
        passwordHash: 'not-a-real-hash',
        name: 'Hana Tester',
        role: 'HR_ADMIN',
      },
    });

    const person = (code: string, fullName: string, joiningDate: string) =>
      tx.employee.create({
        data: {
          employeeCode: `EMPTEST-${code}`,
          fullName,
          gender: 'OTHER',
          jobTitle: 'Tester',
          level: 3,
          countryId: country.id,
          departmentId: department.id,
          joiningDate: date(joiningDate),
        },
      });
    const quin = await person('P001', 'Quin Profile', '2026-01-01');
    const pia = await person('P002', 'Pia Profile', '2023-11-20');

    const pay = (
      employeeId: string,
      annualAmount: string,
      effectiveFrom: string,
      extra: {
        currencyCode?: string;
        reason?: 'HIRE' | 'MERIT' | 'PROMOTION' | 'CORRECTION';
        changedById?: string;
        createdAt?: string;
      } = {},
    ) =>
      tx.salaryRecord.create({
        data: {
          employeeId,
          annualAmount,
          currencyCode: extra.currencyCode ?? 'XTS',
          effectiveFrom: date(effectiveFrom),
          reason: extra.reason,
          changedById: extra.changedById,
          createdAt: date(extra.createdAt ?? effectiveFrom),
        },
      });
    await pay(quin.id, '90000', '2026-01-01', { reason: 'HIRE' });
    await pay(pia.id, '80000', '2023-11-20', { reason: 'HIRE' });
    await pay(pia.id, '88000', '2024-11-20', {
      reason: 'MERIT',
      changedById: hana.id,
    });
    await pay(pia.id, '110000', '2025-04-01', { reason: 'PROMOTION' });
    await pay(pia.id, '112000', '2025-04-01', {
      reason: 'CORRECTION',
      createdAt: '2025-05-01',
    });
    await pay(pia.id, '9000000', '2026-01-01', { currencyCode: 'XTT' });
    await pay(pia.id, '9500000', '2027-01-01', { currencyCode: 'XTT' });

    return { quin, pia };
  }

  it('finds one employee with the same salary, US dollar amount and pay band the directory shows, and nobody for an unknown id', () =>
    inRollback(prisma, async (tx) => {
      const { quin } = await seedProfiles(tx);
      const repository = new EmployeesRepository(asPrismaService(tx));

      const found = await repository.findById(quin.id, today);
      const unknown = await repository.findById(
        '00000000-0000-4000-8000-000000000000',
        today,
      );

      expect(found).toMatchObject({
        id: quin.id,
        employeeCode: 'EMPTEST-P001',
        fullName: 'Quin Profile',
        countryCode: 'XP',
        department: 'Test Department Profile',
        status: 'ACTIVE',
        annualAmount: '90000.00',
        currencyCode: 'XTS',
        annualAmountUsd: '45000.00',
        bandPosition: 'BELOW',
      });
      expect(unknown).toBeNull();
    }));

  it('lists the salary history newest first, with what each step changed, who made it, and which one is in force today', () =>
    inRollback(prisma, async (tx) => {
      const { pia } = await seedProfiles(tx);
      const repository = new EmployeesRepository(asPrismaService(tx));

      const history = await repository.salaryHistory(pia.id, today);

      expect(
        history.map((h) => [
          h.effectiveFrom,
          h.annualAmount,
          h.currencyCode,
          h.state,
        ]),
      ).toEqual([
        ['2027-01-01', '9500000.00', 'XTT', 'SCHEDULED'],
        ['2026-01-01', '9000000.00', 'XTT', 'CURRENT'],
        // The correction shares the promotion's date and was entered later, so it comes first.
        ['2025-04-01', '112000.00', 'XTS', 'PAST'],
        ['2025-04-01', '110000.00', 'XTS', 'PAST'],
        ['2024-11-20', '88000.00', 'XTS', 'PAST'],
        ['2023-11-20', '80000.00', 'XTS', 'PAST'],
      ]);
      expect(history.map((h) => h.changePercent)).toEqual([
        '5.6', // 9,000,000 to 9,500,000
        null, // the currency changed, so a percentage would mean nothing
        '1.8', // the correction: 110,000 to 112,000
        '25.0', // the promotion: 88,000 to 110,000
        '10.0', // the merit raise: 80,000 to 88,000
        null, // the first salary has nothing before it
      ]);
      expect(history[1]).toMatchObject({
        previousAmount: '112000.00',
        previousCurrencyCode: 'XTS',
        reason: null,
        changedByName: null,
      });
      expect(history[4]).toMatchObject({
        reason: 'MERIT',
        changedByName: 'Hana Tester',
        previousAmount: '80000.00',
      });
      expect(history[5]).toMatchObject({
        reason: 'HIRE',
        previousAmount: null,
      });
    }));

  it('gives an empty history for an employee with no salary record', () =>
    inRollback(prisma, async (tx) => {
      await seedProfiles(tx);
      const repository = new EmployeesRepository(asPrismaService(tx));

      expect(
        await repository.salaryHistory(
          '00000000-0000-4000-8000-000000000000',
          today,
        ),
      ).toEqual([]);
    }));
});
