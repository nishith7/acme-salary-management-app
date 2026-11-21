import { Injectable } from '@nestjs/common';
import { calendarDate } from '../common/calendar-date.js';
import type { SalaryChangeReason } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Salaries are inserted this many at a time, so no single statement carries thousands of parameters. */
export const BATCH_SIZE = 1000;

/** One salary an update adds. */
export interface AppliedSalary {
  employeeId: string;
  /** A decimal string, so nothing is rounded on the way in. */
  annualAmount: string;
  currencyCode: string;
  /** YYYY-MM-DD */
  effectiveFrom: string;
  reason: SalaryChangeReason;
}

export interface ApplyInput {
  fileName: string;
  /** SHA-256 (hex) of the file's text. */
  fileSha256: string;
  /** Who applied it; also recorded as the person who made each salary change. */
  uploadedById: string;
  /** Rows that asked for a change. */
  rowCount: number;
  unchangedCount: number;
  skippedCount: number;
  salaries: AppliedSalary[];
}

/** Writes the bulk salary update: the import and the salaries it adds. Queries only; the rules are the service's. */
@Injectable()
export class SalaryUpdatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records the import and adds every salary under it, in one transaction: either all of
   * them are there and trace back to the import, or none are. History is append-only, so
   * this only ever inserts.
   */
  apply(input: ApplyInput): Promise<{ importId: string }> {
    return this.prisma.$transaction(
      async (tx) => {
        const { id: importId } = await tx.import.create({
          data: {
            fileName: input.fileName,
            fileSha256: input.fileSha256,
            uploadedById: input.uploadedById,
            rowCount: input.rowCount,
            appliedCount: input.salaries.length,
            unchangedCount: input.unchangedCount,
            skippedCount: input.skippedCount,
          },
          select: { id: true },
        });
        for (let from = 0; from < input.salaries.length; from += BATCH_SIZE) {
          await tx.salaryRecord.createMany({
            data: input.salaries
              .slice(from, from + BATCH_SIZE)
              .map((salary) => ({
                employeeId: salary.employeeId,
                annualAmount: salary.annualAmount,
                currencyCode: salary.currencyCode,
                effectiveFrom: calendarDate(salary.effectiveFrom),
                reason: salary.reason,
                changedById: input.uploadedById,
                importId,
              })),
          });
        }
        return { importId };
      },
      // 20,000 rows is 20 batches to a database across the internet; the default of five
      // seconds would be too short for the biggest file the update takes.
      { timeout: 120_000, maxWait: 10_000 },
    );
  }
}
