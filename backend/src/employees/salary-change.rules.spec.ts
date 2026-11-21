import { checkSalaryChange } from './salary-change.rules.js';

describe('checkSalaryChange', () => {
  const active = {
    status: 'ACTIVE' as const,
    joiningDate: '2023-11-20',
    hasSalary: true,
  };

  it('accepts a raise for an active employee, effective today or in the future', () => {
    expect(
      checkSalaryChange(active, {
        effectiveFrom: '2026-11-20',
        reason: 'MERIT',
      }),
    ).toBeNull();
    expect(
      checkSalaryChange(active, {
        effectiveFrom: '2030-01-01',
        reason: 'PROMOTION',
      }),
    ).toBeNull();
  });

  it('refuses a change for someone who has left, as a conflict with their record', () => {
    expect(
      checkSalaryChange(
        { ...active, status: 'TERMINATED' },
        { effectiveFrom: '2026-11-20', reason: 'MERIT' },
      ),
    ).toEqual({
      kind: 'conflict',
      message: expect.stringContaining('left') as string,
    });
  });

  it('refuses an effective date before the joining date, and allows the joining date itself', () => {
    expect(
      checkSalaryChange(active, {
        effectiveFrom: '2023-11-19',
        reason: 'CORRECTION',
      }),
    ).toMatchObject({
      kind: 'invalid',
      message: expect.stringContaining('2023-11-20') as string,
    });
    expect(
      checkSalaryChange(active, {
        effectiveFrom: '2023-11-20',
        reason: 'CORRECTION',
      }),
    ).toBeNull();
  });

  it('wants the reason HIRE for the first salary, and only for the first', () => {
    const noSalary = { ...active, hasSalary: false };

    expect(
      checkSalaryChange(noSalary, {
        effectiveFrom: '2023-11-20',
        reason: 'HIRE',
      }),
    ).toBeNull();
    expect(
      checkSalaryChange(noSalary, {
        effectiveFrom: '2023-11-20',
        reason: 'MERIT',
      }),
    ).toMatchObject({ kind: 'invalid' });
    expect(
      checkSalaryChange(active, {
        effectiveFrom: '2026-11-20',
        reason: 'HIRE',
      }),
    ).toMatchObject({ kind: 'invalid' });
  });
});
