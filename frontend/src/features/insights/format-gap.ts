/**
 * The gap as words a person can read at a glance. The API sends the women's median against the
 * men's as a percentage of the men's, as text with one decimal: "-8.3" means the women's median
 * is 8.3% lower, "4.0" that it is 4.0% higher. The wording carries the direction, so it does
 * not depend on a colour or on reading a minus sign.
 */
export function describeGap(gapPercent: string): string {
  if (gapPercent.startsWith('-')) {
    return `${gapPercent.slice(1)}% lower`;
  }
  return Number(gapPercent) === 0 ? 'No gap' : `${gapPercent}% higher`;
}
