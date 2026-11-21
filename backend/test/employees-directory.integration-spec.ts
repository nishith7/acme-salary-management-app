import type { PrismaClient } from '../src/generated/prisma/client.js';
import { employeeQuerySchema } from '../src/employees/employees.schemas.js';
import { EmployeesRepository } from '../src/employees/employees.repository.js';
import {
  asPrismaService,
  createTestPrisma,
  inRollback,
  type Tx,
} from './support/test-db.js';

/**
 * The directory query against the real database: filters, search, sorting,
 * paging, and the current salary. Every test is rolled back. The data is five
 * made-up employees (code prefix EMPTEST) in two made-up countries (XS and XT),
 * and every query is limited to those countries, so the tests pass whether or
 * not the database has been seeded.
 */
describe('EmployeesRepository.list (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const today = new Date('2026-11-20T00:00:00.000Z');
  const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  /** A query for the test countries only, with the schema's defaults filled in. */
  const query = (input: Record<string, unknown> = {}) =>
    employeeQuerySchema.parse({ countries: ['XS', 'XT'], ...input });

  /**
   * Two countries, two departments, a rate for XS's currency, a band for XS at
   * level 3 (100,000 to 150,000), and these people:
   *
   * 0001 Asha Alpha    active  XS One 3  joined 2026-06-01        tenure 0-1  paid 90,000    (below the band)
   * 0002 Bela Beta     active  XS One 3  joined 2023-11-20        tenure 3-5  paid 112,000   (within; see below)
   * 0003 Chitra Gamma  active  XS Two 4  joined 2024-01-10        tenure 1-3  paid 200,000   (no band at level 4)
   * 0004 Dev Delta     left    XS Two 3  2015-01-01 to 2020-06-30 tenure 5+   paid 160,000   (above the band)
   * 0005 Esha Epsilon  active  XT One 2  joined 2010-05-05        tenure 5+   no salary record
   *
   * Bela's pay is the case for "current salary": hired on 80,000, a merit raise
   * to 110,000 on 2025-04-01 that was corrected the next month to 112,000 on the
   * same date, and a raise dated in the future that must be ignored.
   */
  async function seedDirectory(tx: Tx) {
    const xs = await tx.country.create({
      data: { code: 'XS', name: 'Test Country S', currencyCode: 'XTS' },
    });
    const xt = await tx.country.create({
      data: { code: 'XT', name: 'Test Country T', currencyCode: 'XTT' },
    });
    const one = await tx.department.create({
      data: { name: 'Test Department One' },
    });
    const two = await tx.department.create({
      data: { name: 'Test Department Two' },
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
        countryId: xs.id,
        level: 3,
        minAmount: '100000',
        maxAmount: '150000',
      },
    });

    const person = async (
      code: string,
      fullName: string,
      extra: {
        countryId: string;
        departmentId: string;
        level: number;
        jobTitle?: string;
        joiningDate: string;
        terminatedOn?: string;
      },
    ) =>
      tx.employee.create({
        data: {
          employeeCode: `EMPTEST-${code}`,
          fullName,
          gender: 'OTHER',
          jobTitle: extra.jobTitle ?? 'Tester',
          level: extra.level,
          countryId: extra.countryId,
          departmentId: extra.departmentId,
          joiningDate: date(extra.joiningDate),
          status: extra.terminatedOn ? 'TERMINATED' : 'ACTIVE',
          terminatedOn: extra.terminatedOn ? date(extra.terminatedOn) : null,
        },
      });
    const asha = await person('0001', 'Asha Alpha', {
      countryId: xs.id,
      departmentId: one.id,
      level: 3,
      joiningDate: '2026-06-01',
    });
    const bela = await person('0002', 'Bela Beta', {
      countryId: xs.id,
      departmentId: one.id,
      level: 3,
      joiningDate: '2023-11-20',
    });
    const chitra = await person('0003', 'Chitra Gamma', {
      countryId: xs.id,
      departmentId: two.id,
      level: 4,
      joiningDate: '2024-01-10',
    });
    const dev = await person('0004', 'Dev Delta', {
      countryId: xs.id,
      departmentId: two.id,
      level: 3,
      joiningDate: '2015-01-01',
      terminatedOn: '2020-06-30',
    });
    await person('0005', 'Esha Epsilon', {
      countryId: xt.id,
      departmentId: one.id,
      level: 2,
      jobTitle: 'Lead',
      joiningDate: '2010-05-05',
    });

    const pay = (
      employeeId: string,
      annualAmount: string,
      effectiveFrom: string,
      createdAt = effectiveFrom,
    ) =>
      tx.salaryRecord.create({
        data: {
          employeeId,
          annualAmount,
          currencyCode: 'XTS',
          effectiveFrom: date(effectiveFrom),
          createdAt: date(createdAt),
        },
      });
    await pay(asha.id, '90000', '2026-06-01');
    await pay(bela.id, '80000', '2023-11-20');
    await pay(bela.id, '110000', '2025-04-01');
    await pay(bela.id, '112000', '2025-04-01', '2025-05-01');
    await pay(bela.id, '130000', '2027-01-01');
    await pay(chitra.id, '200000', '2024-01-10');
    await pay(dev.id, '160000', '2015-01-01');
  }

  /** The employee codes a query returns, without the EMPTEST- prefix, in the order returned. */
  const codesOf = async (
    tx: Tx,
    input: Record<string, unknown> = {},
  ): Promise<string[]> => {
    const { rows } = await new EmployeesRepository(asPrismaService(tx)).list(
      query({ sortBy: 'employeeCode', ...input }),
      today,
    );
    return rows.map((row) => row.employeeCode.replace('EMPTEST-', ''));
  };

  it('returns one page of the sorted list and the total across all pages', () =>
    inRollback(prisma, async (tx) => {
      await seedDirectory(tx);
      const repository = new EmployeesRepository(asPrismaService(tx));

      const second = await repository.list(
        query({ sortBy: 'fullName', page: 2, pageSize: 2 }),
        today,
      );
      const byLevelDescending = await repository.list(
        query({ sortBy: 'level', sortOrder: 'desc', pageSize: 1 }),
        today,
      );
      const beyondTheEnd = await repository.list(query({ page: 9 }), today);

      expect(second.rows.map((r) => r.fullName)).toEqual([
        'Chitra Gamma',
        'Dev Delta',
      ]);
      expect(second.total).toBe(5);
      expect(byLevelDescending.rows.map((r) => r.employeeCode)).toEqual([
        'EMPTEST-0003',
      ]);
      expect(beyondTheEnd.rows).toEqual([]);
      expect(beyondTheEnd.total).toBe(5);
    }));

  it('combines filters with AND, takes any of several values within one filter, and searches by name or code', () =>
    inRollback(prisma, async (tx) => {
      await seedDirectory(tx);

      // Within one filter: any of the values.
      expect(await codesOf(tx, { levels: [2, 4] })).toEqual(['0003', '0005']);
      expect(await codesOf(tx, { countries: ['XT'] })).toEqual(['0005']);
      // Across filters: all of them.
      expect(
        await codesOf(tx, {
          levels: [3],
          departments: ['Test Department Two'],
        }),
      ).toEqual(['0004']);
      expect(await codesOf(tx, { statuses: ['TERMINATED'] })).toEqual(['0004']);
      expect(await codesOf(tx, { jobTitles: ['Lead'] })).toEqual(['0005']);
      // Tenure counts whole years, up to the last day for someone who left.
      expect(await codesOf(tx, { tenureBands: ['0-1'] })).toEqual(['0001']);
      expect(await codesOf(tx, { tenureBands: ['1-3'] })).toEqual(['0003']);
      expect(await codesOf(tx, { tenureBands: ['3-5'] })).toEqual(['0002']);
      expect(await codesOf(tx, { tenureBands: ['5+'] })).toEqual([
        '0004',
        '0005',
      ]);
      // Search: name in any case, or code; % and _ are ordinary characters.
      expect(await codesOf(tx, { search: 'bELa' })).toEqual(['0002']);
      expect(await codesOf(tx, { search: 'EMPTEST-0003' })).toEqual(['0003']);
      expect(await codesOf(tx, { search: '%' })).toEqual([]);
      expect(await codesOf(tx, { search: 'a_pha' })).toEqual([]);
    }));

  it('shows the current salary in force today, in local currency and USD, and where it sits against the band', () =>
    inRollback(prisma, async (tx) => {
      await seedDirectory(tx);
      const { rows } = await new EmployeesRepository(asPrismaService(tx)).list(
        query({ sortBy: 'employeeCode' }),
        today,
      );
      const salary = (code: string) => {
        const row = rows.find((r) => r.employeeCode === `EMPTEST-${code}`)!;
        return [
          row.annualAmount,
          row.currencyCode,
          row.annualAmountUsd,
          row.bandPosition,
        ];
      };

      // Bela: the correction wins over the record it fixes (same date, recorded
      // later), and the raise dated in the future is ignored. 112,000 / 2 = 56,000.
      expect(salary('0002')).toEqual([
        '112000.00',
        'XTS',
        '56000.00',
        'WITHIN',
      ]);
      expect(salary('0001')).toEqual(['90000.00', 'XTS', '45000.00', 'BELOW']);
      expect(salary('0004')).toEqual(['160000.00', 'XTS', '80000.00', 'ABOVE']);
      // No band at level 4, and no salary record at all.
      expect(salary('0003')).toEqual(['200000.00', 'XTS', '100000.00', null]);
      expect(salary('0005')).toEqual([null, null, null, null]);
    }));

  it('filters by position against the salary band, leaving out people with no band or no salary', () =>
    inRollback(prisma, async (tx) => {
      await seedDirectory(tx);

      expect(await codesOf(tx, { bandPositions: ['BELOW'] })).toEqual(['0001']);
      expect(await codesOf(tx, { bandPositions: ['WITHIN'] })).toEqual([
        '0002',
      ]);
      expect(await codesOf(tx, { bandPositions: ['ABOVE', 'BELOW'] })).toEqual([
        '0001',
        '0004',
      ]);
    }));

  it('lists everyone who matches, with no paging, in the sort order, with the date the salary in force started', () =>
    inRollback(prisma, async (tx) => {
      await seedDirectory(tx);
      const repository = new EmployeesRepository(asPrismaService(tx));

      // The query asks for a page of 2, which an export must ignore.
      const all = await repository.listAll(
        query({ sortBy: 'employeeCode', page: 2, pageSize: 2 }),
        today,
      );
      const descending = await repository.listAll(
        query({ sortBy: 'employeeCode', sortOrder: 'desc' }),
        today,
      );
      const oneCountry = await repository.listAll(
        query({ countries: ['XT'] }),
        today,
      );

      expect(all.map((r) => r.employeeCode.replace('EMPTEST-', ''))).toEqual([
        '0001',
        '0002',
        '0003',
        '0004',
        '0005',
      ]);
      expect(descending[0]?.employeeCode).toBe('EMPTEST-0005');
      expect(oneCountry.map((r) => r.employeeCode)).toEqual(['EMPTEST-0005']);
      // Bela: the correction shares the raise's date, and that is when the salary in force
      // started. Esha has no salary at all.
      expect(all[1]).toMatchObject({
        annualAmount: '112000.00',
        salaryEffectiveFrom: '2025-04-01',
      });
      expect(all[4]).toMatchObject({
        annualAmount: null,
        salaryEffectiveFrom: null,
      });
    }));
});
