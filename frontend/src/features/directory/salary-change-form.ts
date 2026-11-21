import type {
  SalaryChangeReason,
  SalaryChangeRequest,
} from '../../api/employees.ts';

/** What the "Edit salary" form holds while it is being filled in. */
export interface SalaryChangeForm {
  /** As typed. It is only ever text: money is never turned into a number. */
  annualAmount: string;
  /** YYYY-MM-DD, as a date input gives it. */
  effectiveFrom: string;
  /** Empty until the person chooses. */
  reason: SalaryChangeReason | '';
}

export type SalaryChangeErrors = Partial<
  Record<keyof SalaryChangeForm, string>
>;

// The same rule as the API: digits, optionally a dot and one or two decimals, and not zero.
const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What is wrong with the form, field by field; an empty object means it can be sent. This
 * is for helping the person before they send: the API checks all of it again and has the
 * final say (it alone knows, for instance, whether the employee has left).
 */
export function validateSalaryChange(
  form: SalaryChangeForm,
  joiningDate: string,
): SalaryChangeErrors {
  const errors: SalaryChangeErrors = {};
  const amount = form.annualAmount.trim();

  if (amount === '') {
    errors.annualAmount = 'Enter the new annual salary.';
  } else if (!AMOUNT.test(amount)) {
    errors.annualAmount =
      'Use digits only, with a dot for decimals (for example 52000 or 52000.50).';
  } else if (!/[1-9]/.test(amount)) {
    errors.annualAmount = 'The salary must be more than zero.';
  }

  if (!ISO_DATE.test(form.effectiveFrom)) {
    errors.effectiveFrom = 'Choose the date it takes effect.';
  } else if (form.effectiveFrom < joiningDate) {
    errors.effectiveFrom = 'It cannot take effect before the person joined.';
  }

  if (form.reason === '') {
    errors.reason = 'Choose why the salary is changing.';
  }
  return errors;
}

/** The request body for a form that passed `validateSalaryChange`. */
export function toSalaryChangeRequest(
  form: SalaryChangeForm & { reason: SalaryChangeReason },
): SalaryChangeRequest {
  return {
    annualAmount: form.annualAmount.trim(),
    effectiveFrom: form.effectiveFrom,
    reason: form.reason,
  };
}

/**
 * The reasons to offer. The API wants HIRE for a person's first salary and only for that,
 * so someone with no salary yet is offered HIRE alone and everyone else the other four.
 */
export function reasonsFor(hasSalary: boolean): SalaryChangeReason[] {
  return hasSalary
    ? ['PROMOTION', 'MERIT', 'MARKET_ADJUSTMENT', 'CORRECTION']
    : ['HIRE'];
}

/** A moment as the calendar date on the user's own clock, YYYY-MM-DD. */
export function localIsoDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** The form as first shown: today (or the joining date, if that is later), nothing chosen. */
export function initialSalaryChangeForm(
  hasSalary: boolean,
  joiningDate: string,
  now: Date = new Date(),
): SalaryChangeForm {
  const today = localIsoDate(now);
  const first = reasonsFor(hasSalary)[0];
  return {
    annualAmount: '',
    // A first salary starts the day the person joined; later changes default to today.
    effectiveFrom: hasSalary && today >= joiningDate ? today : joiningDate,
    reason: hasSalary || first === undefined ? '' : first,
  };
}
