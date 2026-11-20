import { randomUUID } from 'node:crypto';
import { Prisma } from '../src/generated/prisma/client.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createTestPrisma, inRollback, type Tx } from './support/test-db.js';

/**
 * Proves the salary_records table in the real database matches the reviewed
 * design. Every test runs in a rolled-back transaction.
 */
describe('salary_records table (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * An employee and a user to attach records to. The country code is made up
   * (XS is reserved for private use) so these tests never clash with the real
   * reference data or with the other specs.
   */
  const setup = async (tx: Tx) => {
    const country = await tx.country.create({
      data: { code: 'XS', name: 'Salarytestland', currencyCode: 'XXX' },
    });
    const department = await tx.department.create({
      data: { name: 'Salary Test Department' },
    });
    const employee = await tx.employee.create({
      data: {
        employeeCode: 'SAL-TEST-00001',
        fullName: 'Hana Rao',
        gender: 'FEMALE',
        jobTitle: 'Software Engineer',
        level: 3,
        countryId: country.id,
        departmentId: department.id,
        joiningDate: new Date('2020-02-29'),
      },
    });
    const user = await tx.user.create({
      data: {
        email: 'salary-test@example.test',
        passwordHash: 'not-a-real-hash',
        name: 'Test HR',
        role: 'HR_ADMIN',
      },
    });
    return { employee, user };
  };

  const recordFor = (
    employeeId: string,
    overrides: Partial<{
      annualAmount: string;
      currencyCode: string;
      effectiveFrom: Date;
      createdAt: Date;
    }> = {},
  ) => ({
    employeeId,
    annualAmount: '85000.00',
    currencyCode: 'INR',
    effectiveFrom: new Date('2024-04-01'),
    ...overrides,
  });

  it('has exactly the reviewed columns, and only reason and changed_by are optional', () =>
    inRollback(prisma, async (tx) => {
      const columns = await tx.$queryRaw<
        { column_name: string; is_nullable: string }[]
      >`SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'salary_records'
        ORDER BY column_name`;

      expect(columns.map((c) => c.column_name)).toEqual([
        'annual_amount',
        'changed_by',
        'created_at',
        'currency_code',
        'effective_from',
        'employee_id',
        'id',
        'reason',
      ]);
      expect(
        columns
          .filter((c) => c.is_nullable === 'YES')
          .map((c) => c.column_name),
      ).toEqual(['changed_by', 'reason']);
    }));

  it('stores money as numeric(14,2) and the currency as char(3), never as a float', () =>
    inRollback(prisma, async (tx) => {
      const columns = await tx.$queryRaw<
        {
          column_name: string;
          udt_name: string;
          numeric_precision: number | null;
          numeric_scale: number | null;
          character_maximum_length: number | null;
        }[]
      >`SELECT column_name, udt_name, numeric_precision, numeric_scale,
               character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'salary_records'
        ORDER BY column_name`;
      const byName = Object.fromEntries(columns.map((c) => [c.column_name, c]));

      expect(byName['annual_amount']).toMatchObject({
        udt_name: 'numeric',
        numeric_precision: 14,
        numeric_scale: 2,
      });
      expect(byName['currency_code']).toMatchObject({
        udt_name: 'bpchar',
        character_maximum_length: 3,
      });
      expect(
        Object.fromEntries(columns.map((c) => [c.column_name, c.udt_name])),
      ).toMatchObject({
        id: 'uuid',
        employee_id: 'uuid',
        changed_by: 'uuid',
        effective_from: 'date',
        created_at: 'timestamptz',
        reason: 'salary_change_reason',
      });
    }));

  it('only accepts the reviewed reasons, in the reviewed order', () =>
    inRollback(prisma, async (tx) => {
      const labels = await tx.$queryRaw<
        { enumlabel: string }[]
      >`SELECT e.enumlabel
        FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'salary_change_reason'
        ORDER BY e.enumsortorder`;

      expect(labels.map((r) => r.enumlabel)).toEqual([
        'HIRE',
        'PROMOTION',
        'MERIT',
        'MARKET_ADJUSTMENT',
        'CORRECTION',
      ]);
    }));

  it('generates a uuid id, sets created_at, and leaves reason and changed_by empty when they are not given', () =>
    inRollback(prisma, async (tx) => {
      const { employee } = await setup(tx);

      const record = await tx.salaryRecord.create({
        data: recordFor(employee.id),
      });

      expect(record.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(record.createdAt).toBeInstanceOf(Date);
      expect(record.reason).toBeNull();
      expect(record.changedById).toBeNull();
    }));

  it('records who changed the salary and why', () =>
    inRollback(prisma, async (tx) => {
      const { employee, user } = await setup(tx);

      const record = await tx.salaryRecord.create({
        data: {
          ...recordFor(employee.id),
          reason: 'PROMOTION',
          changedById: user.id,
        },
      });

      const found = await tx.salaryRecord.findUniqueOrThrow({
        where: { id: record.id },
        include: { changedBy: true },
      });
      expect(found.reason).toBe('PROMOTION');
      expect(found.changedBy?.id).toBe(user.id);
    }));

  it('stores money exactly, as a decimal and not a float', () =>
    inRollback(prisma, async (tx) => {
      const { employee } = await setup(tx);

      const first = await tx.salaryRecord.create({
        data: recordFor(employee.id, { annualAmount: '85000.10' }),
      });
      const largest = await tx.salaryRecord.create({
        data: recordFor(employee.id, {
          annualAmount: '999999999999.99',
          effectiveFrom: new Date('2025-04-01'),
        }),
      });

      const read = async (id: string) =>
        (await tx.salaryRecord.findUniqueOrThrow({ where: { id } }))
          .annualAmount;
      const a = await read(first.id);
      const b = await read(largest.id);
      expect(a).toBeInstanceOf(Prisma.Decimal);
      expect(a.toFixed(2)).toBe('85000.10');
      expect(b.toFixed(2)).toBe('999999999999.99');
    }));

  // Inserted with raw SQL and matched on Postgres's own message, so the test can
  // only pass for the right reason (a bare "rejects" would also accept an error
  // such as "the table does not exist").
  it('rejects an amount too large for numeric(14,2)', () =>
    inRollback(prisma, async (tx) => {
      const { employee } = await setup(tx);

      await expect(
        tx.$executeRaw`INSERT INTO salary_records
            (employee_id, annual_amount, currency_code, effective_from)
          VALUES (${employee.id}::uuid, 1000000000000.00, 'INR', '2024-04-01')`,
      ).rejects.toThrow(/numeric field overflow/i);
    }));

  it('keeps the currency code as three letters and rejects anything longer', () =>
    inRollback(prisma, async (tx) => {
      const { employee } = await setup(tx);
      const record = await tx.salaryRecord.create({
        data: recordFor(employee.id, { currencyCode: 'EUR' }),
      });
      expect(record.currencyCode).toBe('EUR');

      await expect(
        tx.salaryRecord.create({
          data: recordFor(employee.id, { currencyCode: 'EURO' }),
        }),
      ).rejects.toMatchObject({ code: 'P2000' });
    }));

  it('keeps the effective date as a plain date, with no time zone shift', () =>
    inRollback(prisma, async (tx) => {
      const { employee } = await setup(tx);

      const record = await tx.salaryRecord.create({
        data: recordFor(employee.id, { effectiveFrom: new Date('2024-02-29') }),
      });

      const found = await tx.salaryRecord.findUniqueOrThrow({
        where: { id: record.id },
      });
      expect(found.effectiveFrom.toISOString().slice(0, 10)).toBe('2024-02-29');
    }));

  it('allows many records for one employee, including two on the same date, so a correction can sit beside the record it fixes', () =>
    inRollback(prisma, async (tx) => {
      const { employee } = await setup(tx);
      const date = new Date('2024-04-01');

      await tx.salaryRecord.create({
        data: recordFor(employee.id, {
          annualAmount: '80000.00',
          effectiveFrom: date,
          createdAt: new Date('2024-04-02T09:00:00Z'),
        }),
      });
      await tx.salaryRecord.create({
        data: {
          ...recordFor(employee.id, {
            annualAmount: '88000.00',
            effectiveFrom: date,
            createdAt: new Date('2024-06-10T09:00:00Z'),
          }),
          reason: 'CORRECTION',
        },
      });

      expect(
        await tx.salaryRecord.count({ where: { employeeId: employee.id } }),
      ).toBe(2);
      // The rule for the current salary: latest effective date, then newest record.
      const current = await tx.salaryRecord.findFirstOrThrow({
        where: { employeeId: employee.id },
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      });
      expect(current.annualAmount.toFixed(2)).toBe('88000.00');
      expect(current.reason).toBe('CORRECTION');
    }));

  it('rejects a record for an employee that does not exist', () =>
    inRollback(prisma, async (tx) => {
      await setup(tx);

      await expect(
        tx.salaryRecord.create({ data: recordFor(randomUUID()) }),
      ).rejects.toMatchObject({ code: 'P2003' });
    }));

  it('rejects a record changed by a user that does not exist', () =>
    inRollback(prisma, async (tx) => {
      const { employee } = await setup(tx);

      await expect(
        tx.salaryRecord.create({
          data: { ...recordFor(employee.id), changedById: randomUUID() },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    }));

  it('does not allow deleting an employee who has salary records', () =>
    inRollback(prisma, async (tx) => {
      const { employee } = await setup(tx);
      await tx.salaryRecord.create({ data: recordFor(employee.id) });

      await expect(
        tx.employee.delete({ where: { id: employee.id } }),
      ).rejects.toMatchObject({ code: 'P2003' });
    }));

  it('does not allow deleting a user who changed a salary, so the audit trail survives', () =>
    inRollback(prisma, async (tx) => {
      const { employee, user } = await setup(tx);
      await tx.salaryRecord.create({
        data: { ...recordFor(employee.id), changedById: user.id },
      });

      await expect(
        tx.user.delete({ where: { id: user.id } }),
      ).rejects.toMatchObject({ code: 'P2003' });
    }));
});
