import type { BandPosition, TenureBand } from '../../api/employees.ts';

// How the directory shows what the API sends. Money arrives as a decimal string and is only
// ever formatted, never turned into a calculation, and dates arrive as "YYYY-MM-DD".

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// UTC on purpose: "2021-03-01" is a calendar date, not a moment. Read as local midnight, it
// would show as the day before in any time zone west of Greenwich.
// en-US, assembled day-first below: en-GB spells September "Sept", which looks like a typo
// beside the other three-letter months.
const dateFormat = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2021-03-01" -> "1 Mar 2021". Anything that is not a plain date is returned as it came. */
export function formatDate(isoDate: string): string {
  const parts = DATE_PATTERN.exec(isoDate);
  if (!parts) {
    return isoDate;
  }
  const [, year, month, day] = parts;
  const shown = Object.fromEntries(
    dateFormat
      .formatToParts(
        new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))),
      )
      .map((part) => [part.type, part.value]),
  );
  return `${shown.day} ${shown.month} ${shown.year}`;
}

const TENURE_LABELS: Record<TenureBand, string> = {
  '0-1': 'Under 1 yr',
  '1-3': '1–3 yrs',
  '3-5': '3–5 yrs',
  '5+': '5+ yrs',
};

export function formatTenureBand(band: TenureBand): string {
  return TENURE_LABELS[band];
}

const BAND_POSITION_LABELS: Record<BandPosition, string> = {
  BELOW: 'Below band',
  WITHIN: 'Within band',
  ABOVE: 'Above band',
};

export function bandPositionLabel(position: BandPosition): string {
  return BAND_POSITION_LABELS[position];
}

const amountFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});
const usdFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

// Intl.NumberFormat reads a decimal string exactly, with no trip through a floating-point
// number. TypeScript only knows that for numeric-looking template strings, hence the cast.
const exact = (decimal: string) => decimal as `${number}`;

/** "4500000.00" -> "4,500,000". Decimals appear only when the stored amount has them. */
export function formatAmount(decimal: string): string {
  return amountFormat.format(exact(decimal));
}

/** "54216.87" -> "$54,217". Rounded to whole dollars: this is for comparing, not auditing. */
export function formatUsd(decimal: string): string {
  return usdFormat.format(exact(decimal));
}
