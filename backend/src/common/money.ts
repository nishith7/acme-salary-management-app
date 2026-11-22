/**
 * Exact arithmetic on money written as text. A salary is a decimal string everywhere in this
 * app and is never turned into a floating-point number, so these work in whole cents with
 * BigInt: nothing can be off by a fraction.
 */

/** Cents from a decimal string with at most two decimals: "52000.5" is 5200050n. */
export function toCents(amount: string): bigint {
  const [whole = '0', fraction = ''] = amount.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

const abs = (n: bigint): bigint => (n < 0n ? -n : n);

/**
 * The change from `from` to `to` as a percentage with one decimal, as text: "8.1", "-2.5",
 * "0.0". Halves round away from zero, which is what the database does for the history, so
 * the preview and the history never disagree. `from` must be above zero.
 */
export function percentChange(from: string, to: string): string {
  const before = toCents(from);
  const numerator = (toCents(to) - before) * 1000n; // tenths of a percent, times `before`
  let tenths = numerator / before; // BigInt division truncates toward zero
  if (abs(numerator % before) * 2n >= before) {
    tenths += numerator < 0n ? -1n : 1n;
  }
  const magnitude = abs(tenths);
  const sign = tenths < 0n ? '-' : '';
  return `${sign}${magnitude / 10n}.${magnitude % 10n}`;
}
