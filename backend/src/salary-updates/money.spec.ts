import { percentChange, toCents } from './money.js';

describe('toCents', () => {
  it('reads a decimal string exactly, with or without decimals', () => {
    expect(toCents('52000')).toBe(5200000n);
    expect(toCents('52000.5')).toBe(5200050n);
    expect(toCents('52000.50')).toBe(5200050n);
    expect(toCents('0.07')).toBe(7n);
    expect(toCents('999999999999.99')).toBe(99999999999999n);
  });
});

// The same rounding as the database, which worked out the history's percentages: one
// decimal, halves away from zero, and never through a floating-point number.
describe('percentChange', () => {
  it('works out a raise to one decimal', () => {
    expect(percentChange('100.00', '108.00')).toBe('8.0');
    expect(percentChange('80000.00', '88000.00')).toBe('10.0');
    expect(percentChange('110000.00', '112000.00')).toBe('1.8');
    expect(percentChange('9000000.00', '9100000.50')).toBe('1.1');
  });

  it('gives a decrease a minus sign, and no change as 0.0', () => {
    expect(percentChange('100.00', '97.50')).toBe('-2.5');
    expect(percentChange('52000', '52000.00')).toBe('0.0');
  });

  it('rounds a half away from zero, in both directions', () => {
    // 0.05%: exactly half of the last decimal
    expect(percentChange('1000.00', '1000.50')).toBe('0.1');
    expect(percentChange('1000.00', '999.50')).toBe('-0.1');
    // 0.04%: less than half
    expect(percentChange('10000.00', '10004.00')).toBe('0.0');
  });

  it('is exact for amounts that a floating-point number would get wrong', () => {
    // 0.1 + 0.2 style trouble: 33.3% of 3 cents-level amounts
    expect(percentChange('0.10', '0.13')).toBe('30.0');
    expect(percentChange('999999999999.99', '999999999999.99')).toBe('0.0');
  });
});
