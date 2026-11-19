import { generateEmployees } from '../src/seed/employee-generator.js';
import { COUNTRIES, DEPARTMENTS } from '../src/seed/reference-data.js';
import { seedEmployees } from '../src/seed/seed-employees.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createTestPrisma, inRollback } from './support/test-db.js';

/**
 * The seed against the real database: reference data, foreign keys, batching,
 * and re-running. Every test is rolled back. Employee codes use the prefix TST
 * so they can never clash with a real seeded dataset (EMP-...), and the tests
 * pass whether or not the database has already been seeded.
 */
describe('seedEmployees (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // 25 employees in batches of 10, so there are two full batches and a partial one.
  const small = { count: 25, codePrefix: 'TST', batchSize: 10 } as const;
  const testEmployees = { employeeCode: { startsWith: 'TST-' } };
  const day = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

  it('creates the requested number of employees, across several batches', () =>
    inRollback(prisma, async (tx) => {
      const result = await seedEmployees(tx, small);

      expect(result.employeesCreated).toBe(25);
      expect(result.employeesSkipped).toBe(0);
      expect(await tx.employee.count({ where: testEmployees })).toBe(25);
    }));

  it('makes sure every country and department of the reference data exists', () =>
    inRollback(prisma, async (tx) => {
      await seedEmployees(tx, small);

      const countries = await tx.country.findMany({
        where: { code: { in: COUNTRIES.map((c) => c.code) } },
      });
      const departments = await tx.department.findMany({
        where: { name: { in: DEPARTMENTS.map((d) => d.name) } },
      });
      expect(countries).toHaveLength(COUNTRIES.length);
      expect(departments).toHaveLength(DEPARTMENTS.length);
      for (const country of COUNTRIES) {
        expect(
          countries.find((c) => c.code === country.code)?.currencyCode,
        ).toBe(country.currencyCode);
      }
    }));

  it('stores exactly what the generator produced, with each employee in the right country and department', () =>
    inRollback(prisma, async (tx) => {
      await seedEmployees(tx, small);

      const stored = await tx.employee.findMany({
        where: testEmployees,
        include: { country: true, department: true },
        orderBy: { employeeCode: 'asc' },
      });
      const expected = generateEmployees({ count: 25, codePrefix: 'TST' });

      expect(
        stored.map((e) => ({
          employeeCode: e.employeeCode,
          fullName: e.fullName,
          gender: e.gender,
          jobTitle: e.jobTitle,
          level: e.level,
          countryCode: e.country.code,
          departmentName: e.department.name,
          joiningDate: day(e.joiningDate),
          status: e.status,
          terminatedOn: day(e.terminatedOn),
        })),
      ).toEqual(
        expected.map((e) => ({
          employeeCode: e.employeeCode,
          fullName: e.fullName,
          gender: e.gender,
          jobTitle: e.jobTitle,
          level: e.level,
          countryCode: e.countryCode,
          departmentName: e.departmentName,
          joiningDate: day(e.joiningDate),
          status: e.status,
          terminatedOn: day(e.terminatedOn),
        })),
      );
    }));

  it('can be run again safely: the second run creates nothing and changes nothing', () =>
    inRollback(prisma, async (tx) => {
      await seedEmployees(tx, small);

      const second = await seedEmployees(tx, small);

      expect(second).toEqual({
        countriesCreated: 0,
        departmentsCreated: 0,
        employeesCreated: 0,
        employeesSkipped: 25,
      });
      expect(await tx.employee.count({ where: testEmployees })).toBe(25);
    }));

  it('adds only the new employees when run again with a larger count', () =>
    inRollback(prisma, async (tx) => {
      await seedEmployees(tx, small);

      const larger = await seedEmployees(tx, { ...small, count: 40 });

      expect(larger.employeesCreated).toBe(15);
      expect(larger.employeesSkipped).toBe(25);
      expect(await tx.employee.count({ where: testEmployees })).toBe(40);
    }));

  it('never overwrites an employee that already exists, and still adds the others', () =>
    inRollback(prisma, async (tx) => {
      await seedEmployees(tx, { ...small, count: 0 });
      const country = await tx.country.findFirstOrThrow();
      const department = await tx.department.findFirstOrThrow();
      await tx.employee.create({
        data: {
          employeeCode: 'TST-00003',
          fullName: 'Existing Person',
          gender: 'OTHER',
          jobTitle: 'Hand Edited Title',
          level: 7,
          countryId: country.id,
          departmentId: department.id,
          joiningDate: new Date('2001-01-01'),
        },
      });

      const result = await seedEmployees(tx, small);

      expect(result.employeesCreated).toBe(24);
      expect(result.employeesSkipped).toBe(1);
      const kept = await tx.employee.findUniqueOrThrow({
        where: { employeeCode: 'TST-00003' },
      });
      expect(kept.fullName).toBe('Existing Person');
      expect(kept.jobTitle).toBe('Hand Edited Title');
    }));

  it('never overwrites reference data that already exists', () =>
    inRollback(prisma, async (tx) => {
      await tx.country.upsert({
        where: { code: 'IN' },
        create: { code: 'IN', name: 'Bharat', currencyCode: 'INR' },
        update: { name: 'Bharat' },
      });

      await seedEmployees(tx, small);

      const india = await tx.country.findUniqueOrThrow({
        where: { code: 'IN' },
      });
      expect(india.name).toBe('Bharat');
    }));

  it('creates only the reference data for a count of zero', () =>
    inRollback(prisma, async (tx) => {
      const result = await seedEmployees(tx, { ...small, count: 0 });

      expect(result.employeesCreated).toBe(0);
      expect(await tx.employee.count({ where: testEmployees })).toBe(0);
      expect(await tx.country.count({ where: { code: 'IN' } })).toBe(1);
    }));
});
