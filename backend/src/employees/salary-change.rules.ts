import type {
  EmployeeStatus,
  SalaryChangeReason,
} from '../generated/prisma/enums.js';

/** What the rules need to know about the employee. */
export interface SalaryChangeContext {
  status: EmployeeStatus;
  /** YYYY-MM-DD */
  joiningDate: string;
  /** Whether the employee already has any salary on record. */
  hasSalary: boolean;
}

export interface SalaryChangeInput {
  /** YYYY-MM-DD */
  effectiveFrom: string;
  reason: SalaryChangeReason;
}

/**
 * Why a salary change cannot be recorded. `conflict` means the employee's state forbids it
 * (the request itself is fine); `invalid` means the request is wrong for this employee.
 */
export interface SalaryChangeProblem {
  kind: 'conflict' | 'invalid';
  message: string;
}

/**
 * The rules for recording a salary in the app, with no I/O so they are easy to test:
 *  - someone who has left gets no new salary (their history is closed);
 *  - a salary cannot start before the person joined (the same day is fine, and so is a
 *    date in the future, for a raise that starts next month);
 *  - the first salary is recorded as HIRE, and HIRE is only ever the first.
 * The amount and the date's format are checked earlier, by the request schema. Dates are
 * calendar dates as YYYY-MM-DD, which compare correctly as plain text.
 */
export function checkSalaryChange(
  context: SalaryChangeContext,
  input: SalaryChangeInput,
): SalaryChangeProblem | null {
  if (context.status === 'TERMINATED') {
    return {
      kind: 'conflict',
      message:
        'This employee has left, so their salary history is closed and no new salary can be recorded.',
    };
  }
  if (input.effectiveFrom < context.joiningDate) {
    return {
      kind: 'invalid',
      message: `The effective date cannot be before the joining date (${context.joiningDate}).`,
    };
  }
  if (!context.hasSalary && input.reason !== 'HIRE') {
    return {
      kind: 'invalid',
      message:
        'This employee has no salary yet, so the first one is recorded with the reason HIRE.',
    };
  }
  if (context.hasSalary && input.reason === 'HIRE') {
    return {
      kind: 'invalid',
      message:
        'HIRE is only for the first salary. Choose why this one changed: promotion, merit, market adjustment or correction.',
    };
  }
  return null;
}
