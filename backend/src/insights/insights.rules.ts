/**
 * The rules for pay insights, with no I/O so they are easy to test.
 *
 * The privacy rule (requirements section 3): an insight never shows a group of fewer than 5
 * people. A median or a total over two or three people tells the reader roughly what each of
 * them earns. The database already leaves the figures of a small group empty; this is the
 * second lock, so a group below the threshold cannot leave the API however a query changes.
 */
export const MIN_GROUP_SIZE = 5;

/** The pay figures of a set of people, in US dollars, as the database returns them: text, never numbers. */
export interface PayStatsRow {
  headcount: number;
  p25: string | null;
  median: string | null;
  p75: string | null;
  /** The sum of their annual salaries. */
  total: string | null;
}

export interface PayGroupRow extends PayStatsRow {
  /** Country code, department name, or the level as text. */
  key: string;
  label: string;
}

/** Figures that are safe to show: enough people, and every figure present. */
export interface PayFigures {
  headcount: number;
  p25: string;
  median: string;
  p75: string;
  total: string;
}

export interface PayGroup extends PayFigures {
  key: string;
  label: string;
}

/** The figures of a row if it is big enough to show and none is missing; otherwise null. */
function figuresOf(row: PayStatsRow): PayFigures | null {
  if (
    row.headcount < MIN_GROUP_SIZE ||
    row.p25 === null ||
    row.median === null ||
    row.p75 === null ||
    row.total === null
  ) {
    return null;
  }
  return {
    headcount: row.headcount,
    p25: row.p25,
    median: row.median,
    p75: row.p75,
    total: row.total,
  };
}

/**
 * The groups that are big enough to show, in a sensible order (levels by number, everything
 * else by name), and how many were left out. A group is left out if it has fewer than
 * MIN_GROUP_SIZE people or arrived without figures.
 */
export function showableGroups(
  rows: PayGroupRow[],
  grouping: 'country' | 'department' | 'level',
): { groups: PayGroup[]; hiddenGroups: number } {
  const groups = rows.flatMap((row) => {
    const figures = figuresOf(row);
    return figures ? [{ key: row.key, label: row.label, ...figures }] : [];
  });
  groups.sort((a, b) =>
    grouping === 'level'
      ? Number(a.key) - Number(b.key)
      : a.label.localeCompare(b.label),
  );
  return { groups, hiddenGroups: rows.length - groups.length };
}

/** The figures for everyone together, or null when that is fewer than MIN_GROUP_SIZE people. */
export function showableOverall(row: PayStatsRow): PayFigures | null {
  return figuresOf(row);
}
