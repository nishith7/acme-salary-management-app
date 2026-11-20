import type { PrismaClient } from '../src/generated/prisma/client.js';
import { PAY_MODEL, type PayModel } from '../src/seed/pay-model.js';
import { generateSalaryHistory } from '../src/seed/salary-generator.js';
import { seedSalaryHistory } from '../src/seed/seed-salaries.js';
import { createTestPrisma, inRollback, type Tx } from './support/test-db.js';

/**
 * The salary-history seed against the real database: which employees it touches,
 * what it stores, and re-running. Every test is rolled back. The employees use
 * the code prefix SAL-TEST, a made-up country (XS, currency XTS) and a made-up
 * department, and the seed is handed a pay model that knows exactly those, so
 * the tests pass whether or not the database has been seeded.
 */
describe('seedSalaryHistory (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const payModel: PayModel = {
    ladderUsd: PAY_MODEL.ladderUsd,
    countryPayIndex: { XS: 0.5 },
    unitsPerUsd: { XTS: 2 },
    departmentFactor: { 'Test Department Salary': 1 },
  };
  // Batches of 2, so five employees take three statements.
  const seedOptions = {
    codePrefix: 'SAL-TEST',
    count: 5,
    batchSize: 2,
    payModel,
  } as const;
  const testEmployees = { employeeCode: { startsWith: 'SAL-TEST-' } };
  const fiveCodes = [1, 2, 3, 4, 5].map((n) => `SAL-TEST-0000${n}`);
  const day = (date: Date) => date.toISOString().slice(0, 10);

  /** Makes the test country and department, then one employee for each code. */
  async function createEmployees(tx: Tx, codes: string[]) {
    const country = await tx.country.create({
      data: { code: 'XS', name: 'Test Country Salary', currencyCode: 'XTS' },
    });
    const department = await tx.department.create({
      data: { name: 'Test Department Salary' },
    });
    for (const [index, employeeCode] of codes.entries()) {
      const left = index === codes.length - 1;
      await tx.employee.create({
        data: {
          employeeCode,
          fullName: `Test Person ${index + 1}`,
          gender: index % 2 === 0 ? 'FEMALE' : 'MALE',
          jobTitle: 'Tester',
          level: (index % 4) + 1,
          countryId: country.id,
          departmentId: department.id,
          joiningDate: new Date(`201${index}-02-10`),
          status: left ? 'TERMINATED' : 'ACTIVE',
          terminatedOn: left ? new Date('2023-05-20') : null,
        },
      });
    }
  }

  const countRecords = (tx: Tx, employeeCode?: string) =>
    tx.salaryRecord.count({
      where: { employee: employeeCode ? { employeeCode } : testEmployees },
    });

  it('stores exactly what the generator produces for each stored employee, across several batches', () =>
    inRollback(prisma, async (tx) => {
      await createEmployees(tx, fiveCodes);

      const result = await seedSalaryHistory(tx, seedOptions);

      const employees = await tx.employee.findMany({
        where: testEmployees,
        include: { country: true, department: true },
      });
      let total = 0;
      for (const e of employees) {
        const expected = generateSalaryHistory(
          {
            employeeCode: e.employeeCode,
            gender: e.gender,
            level: e.level,
            countryCode: e.country.code,
            currencyCode: e.country.currencyCode,
            departmentName: e.department.name,
            joiningDate: e.joiningDate,
            terminatedOn: e.terminatedOn,
          },
          { payModel },
        ).map((r) => ({
          annualAmount: `${r.annualAmount}.00`,
          currencyCode: 'XTS',
          effectiveFrom: day(r.effectiveFrom),
          reason: r.reason,
          createdAt: r.createdAt.toISOString(),
        }));
        const stored = (
          await tx.salaryRecord.findMany({
            where: { employeeId: e.id },
            orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
          })
        ).map((r) => ({
          annualAmount: r.annualAmount.toFixed(2),
          currencyCode: r.currencyCode,
          effectiveFrom: day(r.effectiveFrom),
          reason: r.reason,
          createdAt: r.createdAt.toISOString(),
        }));

        expect(stored).toEqual(expected);
        total += expected.length;
      }
      expect(result.employeesSeeded).toBe(5);
      expect(result.salaryRecordsCreated).toBe(total);
    }));

  it('can be run again safely: the second run creates nothing and changes nothing', () =>
    inRollback(prisma, async (tx) => {
      await createEmployees(tx, fiveCodes);
      await seedSalaryHistory(tx, seedOptions);
      const before = await countRecords(tx);

      const second = await seedSalaryHistory(tx, seedOptions);

      expect(second.employeesSeeded).toBe(0);
      expect(second.employeesAlreadyHadHistory).toBe(5);
      expect(second.salaryRecordsCreated).toBe(0);
      expect(await countRecords(tx)).toBe(before);
    }));

  it('leaves an employee who already has a salary record exactly as they are, and still seeds the others', () =>
    inRollback(prisma, async (tx) => {
      await createEmployees(tx, fiveCodes);
      const kept = await tx.employee.findUniqueOrThrow({
        where: { employeeCode: 'SAL-TEST-00003' },
      });
      await tx.salaryRecord.create({
        data: {
          employeeId: kept.id,
          annualAmount: '123456.00',
          currencyCode: 'XTS',
          effectiveFrom: new Date('2024-01-01'),
        },
      });

      await seedSalaryHistory(tx, seedOptions);

      const records = await tx.salaryRecord.findMany({
        where: { employeeId: kept.id },
      });
      expect(records).toHaveLength(1);
      expect(records[0]!.annualAmount.toFixed(2)).toBe('123456.00');
      expect(await countRecords(tx, 'SAL-TEST-00001')).toBeGreaterThanOrEqual(
        1,
      );
    }));

  it('touches only the numbered set it is asked for: not another prefix, and not a number above the count', () =>
    inRollback(prisma, async (tx) => {
      await createEmployees(tx, [
        'SAL-TEST-00001',
        'SAL-TEST-00002',
        'SAL-TEST-00003',
        'SAL-TEST-00004',
        'SAL-OTHER-00001',
      ]);

      await seedSalaryHistory(tx, { ...seedOptions, count: 3 });

      expect(await countRecords(tx, 'SAL-TEST-00003')).toBeGreaterThanOrEqual(
        1,
      );
      expect(await countRecords(tx, 'SAL-TEST-00004')).toBe(0);
      expect(await countRecords(tx, 'SAL-OTHER-00001')).toBe(0);
    }));
});
