import type { PrismaClient } from '../src/generated/prisma/client.js';
import { EmployeesRepository } from '../src/employees/employees.repository.js';
import { SalaryUpdatesService } from '../src/salary-updates/salary-updates.service.js';
import {
  BATCH_SIZE,
  SalaryUpdatesRepository,
} from '../src/salary-updates/salary-updates.repository.js';
import {
  asPrismaService,
  createTestPrisma,
  inRollback,
  type Tx,
} from './support/test-db.js';

/**
 * Applying a bulk salary update against the real database: the import row, the salaries it
 * adds and what they point back to. Every test is rolled back. The data is made up (country
 * XU, a user, employees EMPTEST-U...), so the tests pass whether or not the database is seeded.
 */
describe('SalaryUpdatesRepository.apply (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  /** A user, and two employees who each already have one salary. */
  async function seed(tx: Tx) {
    const country = await tx.country.create({
      data: { code: 'XU', name: 'Test Country U', currencyCode: 'XTS' },
    });
    const department = await tx.department.create({
      data: { name: 'Test Department Import' },
    });
    const user = await tx.user.create({
      data: {
        email: 'importer@import-test.invalid',
        passwordHash: 'not-a-real-hash',
        name: 'Ira Importer',
        role: 'HR_ADMIN',
      },
    });
    const person = (code: string, name: string) =>
      tx.employee.create({
        data: {
          employeeCode: `EMPTEST-${code}`,
          fullName: name,
          gender: 'OTHER',
          jobTitle: 'Tester',
          level: 3,
          countryId: country.id,
          departmentId: department.id,
          joiningDate: date('2023-01-01'),
        },
      });
    const ann = await person('U001', 'Ann Update');
    const ben = await person('U002', 'Ben Update');
    for (const employee of [ann, ben]) {
      await tx.salaryRecord.create({
        data: {
          employeeId: employee.id,
          annualAmount: '50000',
          currencyCode: 'XTS',
          effectiveFrom: date('2023-01-01'),
          reason: 'HIRE',
        },
      });
    }
    return { user, ann, ben };
  }

  it('records the import and adds each salary exactly as given, pointing back to it, as the user who applied it', () =>
    inRollback(prisma, async (tx) => {
      const { user, ann, ben } = await seed(tx);
      const repository = new SalaryUpdatesRepository(asPrismaService(tx));

      const { importId } = await repository.apply({
        fileName: 'raises.csv',
        fileSha256: 'a'.repeat(64),
        uploadedById: user.id,
        rowCount: 5,
        unchangedCount: 2,
        skippedCount: 1,
        salaries: [
          {
            employeeId: ann.id,
            annualAmount: '52000.50',
            currencyCode: 'XTS',
            effectiveFrom: '2026-12-01',
            reason: 'MERIT',
          },
          {
            employeeId: ben.id,
            annualAmount: '70000',
            currencyCode: 'XTS',
            effectiveFrom: '2026-11-01',
            reason: 'PROMOTION',
          },
        ],
      });

      expect(
        await tx.import.findUniqueOrThrow({ where: { id: importId } }),
      ).toMatchObject({
        fileName: 'raises.csv',
        fileSha256: 'a'.repeat(64),
        uploadedById: user.id,
        rowCount: 5,
        appliedCount: 2,
        unchangedCount: 2,
        skippedCount: 1,
      });
      const added = await tx.salaryRecord.findMany({
        where: { importId },
        orderBy: { annualAmount: 'asc' },
      });
      expect(
        added.map((r) => [
          r.employeeId,
          r.annualAmount.toFixed(2),
          r.currencyCode,
          r.effectiveFrom.toISOString().slice(0, 10),
          r.reason,
          r.changedById,
        ]),
      ).toEqual([
        [ann.id, '52000.50', 'XTS', '2026-12-01', 'MERIT', user.id],
        [ben.id, '70000.00', 'XTS', '2026-11-01', 'PROMOTION', user.id],
      ]);
      // The salaries they had are untouched, and point to no import.
      expect(
        await tx.salaryRecord.count({
          where: { employeeId: { in: [ann.id, ben.id] }, importId: null },
        }),
      ).toBe(2);
    }));

  it('adds more salaries than fit in one batch, all under the same import', () =>
    inRollback(prisma, async (tx) => {
      const { user, ann } = await seed(tx);
      const repository = new SalaryUpdatesRepository(asPrismaService(tx));
      const count = BATCH_SIZE + 1;

      const { importId } = await repository.apply({
        fileName: 'many.csv',
        fileSha256: 'b'.repeat(64),
        uploadedById: user.id,
        rowCount: count,
        unchangedCount: 0,
        skippedCount: 0,
        // One person, a different day each, so the rows are distinct.
        salaries: Array.from({ length: count }, (_, i) => ({
          employeeId: ann.id,
          annualAmount: String(51000 + i),
          currencyCode: 'XTS',
          effectiveFrom: new Date(Date.UTC(2024, 0, 1 + i))
            .toISOString()
            .slice(0, 10),
          reason: 'MERIT' as const,
        })),
      });

      expect(await tx.salaryRecord.count({ where: { importId } })).toBe(count);
      expect(
        (await tx.import.findUniqueOrThrow({ where: { id: importId } }))
          .appliedCount,
      ).toBe(count);
    }));

  describe('applying a file through the service', () => {
    const header = 'Employee ID,New annual salary,Effective from,Reason';
    const serviceOn = (tx: Tx) =>
      new SalaryUpdatesService(
        new EmployeesRepository(asPrismaService(tx)),
        new SalaryUpdatesRepository(asPrismaService(tx)),
      );

    it('adds nothing the second time the same file is applied, even for a raise dated in the future', () =>
      inRollback(prisma, async (tx) => {
        const { user, ann } = await seed(tx);
        const service = serviceOn(tx);
        // A raise that starts far in the future: today's salary does not change when it is
        // applied, so "is this already the salary?" must be asked on the row's own date.
        const csv = [header, 'EMPTEST-U001,52000,2099-01-01,Merit'].join(
          '\r\n',
        );

        const first = await service.apply(csv, 'raises.csv', user.id);
        const second = await service.apply(csv, 'raises.csv', user.id);

        expect(first).toEqual({
          importId: expect.any(String) as string,
          applied: 1,
          unchanged: 0,
          skipped: 0,
        });
        expect(second).toEqual({
          importId: null,
          applied: 0,
          unchanged: 1,
          skipped: 0,
        });
        // The original salary and the one raise: not two raises.
        expect(
          await tx.salaryRecord.count({ where: { employeeId: ann.id } }),
        ).toBe(2);
        expect(
          await tx.import.count({ where: { uploadedById: user.id } }),
        ).toBe(1);
      }));

    it('judges "already that salary" on the date the row asks for, not on today', () =>
      inRollback(prisma, async (tx) => {
        const { ann } = await seed(tx);
        // Ann was on 50,000 from 2023 and has been on 60,000 since 2025.
        await tx.salaryRecord.create({
          data: {
            employeeId: ann.id,
            annualAmount: '60000',
            currencyCode: 'XTS',
            effectiveFrom: date('2025-01-01'),
            reason: 'MERIT',
          },
        });
        const service = serviceOn(tx);

        // 50,000 on a day in 2024 is what she was paid then: nothing to add. 50,000 on a day in
        // 2026 would lower her pay from 60,000: that is a change.
        const csv = [header, 'EMPTEST-U001,50000,2024-06-01,Correction'].join(
          '\r\n',
        );
        const backdated = await service.preview(csv);
        const later = await service.preview(
          [header, 'EMPTEST-U001,50000,2026-06-01,Correction'].join('\r\n'),
        );

        expect(backdated.rows[0]?.outcome).toBe('UNCHANGED');
        expect(later.rows[0]?.outcome).toBe('WILL_UPDATE');
        // And the change is measured from what she was paid on that date.
        expect(later.rows[0]?.change).toMatchObject({
          previousAmount: '60000.00',
          changePercent: '-16.7',
        });
      }));
  });
});
