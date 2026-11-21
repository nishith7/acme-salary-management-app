import { describe, expect, it } from 'vitest';
import {
  bandPositionLabel,
  formatAmount,
  formatChangePercent,
  formatDate,
  formatMoney,
  formatTenureBand,
  formatUsd,
  salaryChangeTitle,
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

describe('salary history formatting', () => {
  it('shows an amount in its own currency, with decimals only when the stored amount has them', () => {
    expect(formatMoney('48700.00', 'GBP')).toBe('£48,700');
    expect(formatMoney('102800.50', 'EUR')).toBe('€102,800.50');
    // A non-breaking space, so the code and the number never wrap apart.
    expect(formatMoney('87000.00', 'SGD')).toBe('SGD 87,000');
  });

  it('shows the code before the number when the browser does not know the currency', () => {
    expect(formatMoney('1500.00', 'not-a-currency')).toBe(
      'not-a-currency 1,500',
    );
  });

  it('adds only the sign to a percentage the API has already worked out', () => {
    expect(formatChangePercent('8.1')).toBe('+8.1%');
    expect(formatChangePercent('-2.5')).toBe('−2.5%');
    expect(formatChangePercent('0.0')).toBe('0.0%');
  });

  it('names a step by its reason, and plainly when there is none', () => {
    expect(salaryChangeTitle('HIRE')).toBe('Joined ACME');
    expect(salaryChangeTitle('MARKET_ADJUSTMENT')).toBe('Market adjustment');
    expect(salaryChangeTitle(null)).toBe('Salary recorded');
  });
});
