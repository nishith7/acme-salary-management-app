import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createTestPrisma, inRollback, type Tx } from './support/test-db.js';

/**
 * Proves the employees table in the real database matches the reviewed design.
 * Every test runs in a rolled-back transaction.
 */
describe('employees table (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * A country and a department to attach employees to. The codes are made up
   * (ZZ and XXX are reserved for private use) so these tests can never clash
   * with the realistic reference data the seed loads later.
   */
  const reference = async (tx: Tx) => ({
    country: await tx.country.create({
      data: { code: 'ZZ', name: 'Testland', currencyCode: 'XXX' },
    }),
    department: await tx.department.create({
      data: { name: 'Test Department' },
    }),
  });

  const employeeData = (
    refs: Awaited<ReturnType<typeof reference>>,
    overrides: Partial<{
      employeeCode: string;
      fullName: string;
    }> = {},
  ) => ({
    employeeCode: 'EMPTEST-00001',
    fullName: 'Hana Rao',
    gender: 'FEMALE' as const,
    jobTitle: 'Software Engineer',
    level: 3,
    departmentId: refs.department.id,
    countryId: refs.country.id,
    joiningDate: new Date('2020-02-29'),
    ...overrides,
  });

  it('has exactly the reviewed columns, and only terminated_on is optional', () =>
    inRollback(prisma, async (tx) => {
      const columns = await tx.$queryRaw<
        { column_name: string; is_nullable: string }[]
      >`SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'employees'
        ORDER BY column_name`;

      expect(columns.map((c) => c.column_name)).toEqual([
        'country_id',
        'created_at',
        'department_id',
        'employee_code',
        'full_name',
        'gender',
        'id',
        'job_title',
        'joining_date',
        'level',
        'status',
        'terminated_on',
        'updated_at',
      ]);
      expect(
        columns
          .filter((c) => c.is_nullable === 'YES')
          .map((c) => c.column_name),
      ).toEqual(['terminated_on']);
    }));

  it('stores the types of the design: integer level, plain dates, timestamps with time zone, enums', () =>
    inRollback(prisma, async (tx) => {
      const columns = await tx.$queryRaw<
        { column_name: string; data_type: string; udt_name: string }[]
      >`SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'employees'
          AND column_name IN ('id', 'level', 'joining_date', 'terminated_on',
                              'created_at', 'updated_at', 'gender', 'status',
                              'department_id', 'country_id')
        ORDER BY column_name`;

      expect(
        Object.fromEntries(columns.map((c) => [c.column_name, c.udt_name])),
      ).toEqual({
        country_id: 'uuid',
        created_at: 'timestamptz',
        department_id: 'uuid',
        gender: 'gender',
        id: 'uuid',
        joining_date: 'date',
        level: 'int4',
        status: 'employee_status',
        terminated_on: 'date',
        updated_at: 'timestamptz',
      });
    }));

  it('only accepts the reviewed genders and statuses, in the reviewed order', () =>
    inRollback(prisma, async (tx) => {
      const labels = (type: string) =>
        tx.$queryRaw<{ enumlabel: string }[]>`SELECT e.enumlabel
          FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = ${type}
          ORDER BY e.enumsortorder`;

      expect((await labels('gender')).map((r) => r.enumlabel)).toEqual([
        'FEMALE',
        'MALE',
        'OTHER',
      ]);
      expect((await labels('employee_status')).map((r) => r.enumlabel)).toEqual(
        ['ACTIVE', 'TERMINATED'],
      );
    }));

  it('generates a uuid id and fills in the defaults: active, not terminated, timestamps set', () =>
    inRollback(prisma, async (tx) => {
      const refs = await reference(tx);

      const employee = await tx.employee.create({ data: employeeData(refs) });

      expect(employee.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(employee.status).toBe('ACTIVE');
      expect(employee.terminatedOn).toBeNull();
      expect(employee.createdAt).toBeInstanceOf(Date);
      expect(employee.updatedAt).toBeInstanceOf(Date);
    }));

  it('stores every field it is given and reads it back', () =>
    inRollback(prisma, async (tx) => {
      const refs = await reference(tx);
      const created = await tx.employee.create({ data: employeeData(refs) });

      const found = await tx.employee.findUniqueOrThrow({
        where: { id: created.id },
      });

      expect(found).toMatchObject({
        employeeCode: 'EMPTEST-00001',
        fullName: 'Hana Rao',
        gender: 'FEMALE',
        jobTitle: 'Software Engineer',
        level: 3,
        departmentId: refs.department.id,
        countryId: refs.country.id,
      });
    }));

  it('keeps dates as plain dates, with no time zone shift', () =>
    inRollback(prisma, async (tx) => {
      const refs = await reference(tx);

      const employee = await tx.employee.create({
        data: {
          ...employeeData(refs),
          status: 'TERMINATED',
          terminatedOn: new Date('2024-12-31'),
        },
      });

      const found = await tx.employee.findUniqueOrThrow({
        where: { id: employee.id },
      });
      expect(found.joiningDate.toISOString().slice(0, 10)).toBe('2020-02-29');
      expect(found.terminatedOn?.toISOString().slice(0, 10)).toBe('2024-12-31');
      expect(found.status).toBe('TERMINATED');
    }));

  it('allows two employees with the same name, because names are not unique', () =>
    inRollback(prisma, async (tx) => {
      const refs = await reference(tx);
      await tx.employee.create({ data: employeeData(refs) });

      const second = await tx.employee.create({
        data: employeeData(refs, { employeeCode: 'EMPTEST-00002' }),
      });

      expect(second.fullName).toBe('Hana Rao');
    }));

  it('rejects a second employee with the same employee code', () =>
    inRollback(prisma, async (tx) => {
      const refs = await reference(tx);
      await tx.employee.create({ data: employeeData(refs) });

      await expect(
        tx.employee.create({
          data: employeeData(refs, { fullName: 'Someone Else' }),
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    }));

  it('rejects an employee in a department that does not exist', () =>
    inRollback(prisma, async (tx) => {
      const refs = await reference(tx);

      await expect(
        tx.employee.create({
          data: { ...employeeData(refs), departmentId: randomUUID() },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    }));

  it('rejects an employee in a country that does not exist', () =>
    inRollback(prisma, async (tx) => {
      const refs = await reference(tx);

      await expect(
        tx.employee.create({
          data: { ...employeeData(refs), countryId: randomUUID() },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    }));

  it('does not allow deleting a department that still has employees', () =>
    inRollback(prisma, async (tx) => {
      const refs = await reference(tx);
      await tx.employee.create({ data: employeeData(refs) });

      await expect(
        tx.department.delete({ where: { id: refs.department.id } }),
      ).rejects.toMatchObject({ code: 'P2003' });
    }));

  it('does not allow deleting a country that still has employees', () =>
    inRollback(prisma, async (tx) => {
      const refs = await reference(tx);
      await tx.employee.create({ data: employeeData(refs) });

      await expect(
        tx.country.delete({ where: { id: refs.country.id } }),
      ).rejects.toMatchObject({ code: 'P2003' });
    }));
});
