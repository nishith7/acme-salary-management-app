import type {
  BandPosition,
  SalaryChangeReason,
  TenureBand,
} from '../../api/employees.ts';

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

const moneyFormats = new Map<string, Intl.NumberFormat>();

/**
 * "88000.00", "EUR" -> "€88,000"; "102800.50", "EUR" -> "€102,800.50"; "87000.00", "SGD" ->
 * "SGD 87,000". The symbol or code comes from the currency itself. A whole amount shows no
 * decimals and any other shows exactly two (never "€102,800.5"). A code the browser does not
 * know is shown as plain text before the number.
 */
export function formatMoney(decimal: string, currencyCode: string): string {
  const whole = /^[^.]*(\.0+)?$/.test(decimal);
  const key = `${currencyCode}:${whole}`;
  let format = moneyFormats.get(key);
  if (!format) {
    try {
      format = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: whole ? 0 : 2,
        maximumFractionDigits: whole ? 0 : 2,
      });
    } catch {
      return `${currencyCode} ${formatAmount(decimal)}`;
    }
    moneyFormats.set(key, format);
  }
  return format.format(exact(decimal));
}

/**
 * "8.1" -> "+8.1%", "-2.5" -> "−2.5%" (a real minus sign), "0.0" -> "0.0%". The API sends the
 * percentage as text, worked out exactly in the database, so this only adds the sign.
 */
export function formatChangePercent(percent: string): string {
  if (percent.startsWith('-')) {
    return `−${percent.slice(1)}%`;
  }
  return Number(percent) === 0 ? `${percent}%` : `+${percent}%`;
}

const REASON_TITLES: Record<SalaryChangeReason, string> = {
  HIRE: 'Joined ACME',
  PROMOTION: 'Promotion',
  MERIT: 'Merit increase',
  MARKET_ADJUSTMENT: 'Market adjustment',
  CORRECTION: 'Correction',
};

/** What a step of the salary history is called. No reason (a spreadsheet upload) gets a plain title. */
export function salaryChangeTitle(reason: SalaryChangeReason | null): string {
  return reason ? REASON_TITLES[reason] : 'Salary recorded';
}
