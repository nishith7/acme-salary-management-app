import { describe, expect, it } from 'vitest';
import {
  initialSalaryChangeForm,
  localIsoDate,
  reasonsFor,
  toSalaryChangeRequest,
  validateSalaryChange,
} from './salary-change-form.ts';

const joined = '2023-11-20';
const good = {
  annualAmount: '52000.50',
  effectiveFrom: '2026-12-01',
  reason: 'MERIT' as const,
};

// The API refuses anything else with a 400, so the form must not send it, and must say why.
describe('checking the salary change form', () => {
  it('has nothing to say about a complete form', () => {
    expect(validateSalaryChange(good, joined)).toEqual({});
    expect(
      validateSalaryChange({ ...good, annualAmount: ' 52000 ' }, joined),
    ).toEqual({});
  });

  it('refuses an amount that is empty, zero, has thousands separators or has more than two decimals', () => {
    for (const annualAmount of [
      '',
      '0',
      '0.00',
      '52,000',
      '52000.123',
      '-5',
      'abc',
    ]) {
      expect(
        validateSalaryChange({ ...good, annualAmount }, joined).annualAmount,
        annualAmount,
      ).toEqual(expect.any(String));
    }
  });

  it('refuses a date before the joining date, and accepts the joining date itself', () => {
    expect(
      validateSalaryChange({ ...good, effectiveFrom: '2023-11-19' }, joined)
        .effectiveFrom,
    ).toEqual(expect.any(String));
    expect(
      validateSalaryChange({ ...good, effectiveFrom: joined }, joined),
    ).toEqual({});
    expect(
      validateSalaryChange({ ...good, effectiveFrom: '' }, joined)
        .effectiveFrom,
    ).toEqual(expect.any(String));
  });

  it('wants a reason to be chosen', () => {
    expect(
      validateSalaryChange({ ...good, reason: '' }, joined).reason,
    ).toEqual(expect.any(String));
  });
});

describe('building the request', () => {
  it('sends the amount as the text that was typed, trimmed, never as a number', () => {
    const request = toSalaryChangeRequest({
      ...good,
      annualAmount: ' 52000.50 ',
    });

    expect(request).toEqual({
      annualAmount: '52000.50',
      effectiveFrom: '2026-12-01',
      reason: 'MERIT',
    });
    expect(typeof request.annualAmount).toBe('string');
  });
});

describe('the form as first shown', () => {
  it('offers HIRE alone for a first salary, and the four other reasons otherwise', () => {
    expect(reasonsFor(false)).toEqual(['HIRE']);
    expect(reasonsFor(true)).toEqual([
      'PROMOTION',
      'MERIT',
      'MARKET_ADJUSTMENT',
      'CORRECTION',
    ]);
  });

  it('starts on today, or on the joining date for someone who has not joined yet or has no salary', () => {
    const now = new Date(2026, 10, 21, 9, 30); // 21 Nov 2026, on the machine's own clock

    expect(localIsoDate(now)).toBe('2026-11-21');
    expect(initialSalaryChangeForm(true, joined, now)).toEqual({
      annualAmount: '',
      effectiveFrom: '2026-11-21',
      reason: '',
    });
    expect(initialSalaryChangeForm(true, '2027-01-10', now).effectiveFrom).toBe(
      '2027-01-10',
    );
    expect(initialSalaryChangeForm(false, joined, now)).toEqual({
      annualAmount: '',
      effectiveFrom: joined,
      reason: 'HIRE',
    });
  });
});
