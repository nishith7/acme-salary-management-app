import { describe, expect, it } from 'vitest';
import {
  bandPositionLabel,
  formatAmount,
  formatDate,
  formatTenureBand,
  formatUsd,
} from './format.ts';

describe('directory formatting', () => {
  it('shows a stored calendar date as that same date, whatever the machine time zone', () => {
    // "2021-03-01" parsed as local midnight shows as 28 Feb west of Greenwich, which would
    // put a wrong joining date on a person's record. The test config runs in such a zone.
    expect(formatDate('2021-03-01')).toBe('1 Mar 2021');
    expect(formatDate('2020-12-31')).toBe('31 Dec 2020');
    expect(formatDate('2019-09-07')).toBe('7 Sep 2019');
  });

  it('shows tenure bands in words', () => {
    expect(formatTenureBand('0-1')).toBe('Under 1 yr');
    expect(formatTenureBand('1-3')).toBe('1–3 yrs');
    expect(formatTenureBand('3-5')).toBe('3–5 yrs');
    expect(formatTenureBand('5+')).toBe('5+ yrs');
  });

  it('groups digits, and shows decimals only when the stored amount has them', () => {
    expect(formatAmount('4500000.00')).toBe('4,500,000');
    expect(formatAmount('45000.50')).toBe('45,000.5');
    expect(formatAmount('999999999999.99')).toBe('999,999,999,999.99');
  });

  it('shows US dollars rounded to whole dollars, with the symbol', () => {
    expect(formatUsd('54216.87')).toBe('$54,217');
    expect(formatUsd('54216.49')).toBe('$54,216');
  });

  it('names where pay sits against the band', () => {
    expect(bandPositionLabel('BELOW')).toBe('Below band');
    expect(bandPositionLabel('WITHIN')).toBe('Within band');
    expect(bandPositionLabel('ABOVE')).toBe('Above band');
  });
});
