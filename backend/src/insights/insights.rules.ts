import { percentChange } from '../common/money.js';

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

/** One side of a comparison: how many people, and their median pay in US dollars. */
export interface GenderSide {
  headcount: number;
  medianUsd: string;
}

/** The pay of women and of men, and the gap between them. */
export interface GenderGap {
  women: GenderSide;
  men: GenderSide;
  /**
   * The women's median against the men's, as a percentage of the men's, with one decimal:
   * "-8.3" means the women's median is 8.3% lower, "4.0" that it is 4.0% higher.
   */
  gapPercent: string;
}

export interface GenderGapLevel extends GenderGap {
  level: number;
  label: string;
}

/** The median pay of one gender at one level, as the database returns it. */
export interface GenderRow {
  level: number;
  gender: 'FEMALE' | 'MALE';
  headcount: number;
  median: string | null;
}

export type GenderOverallRow = Omit<GenderRow, 'level'>;

/** A side that is safe to show: at least MIN_GROUP_SIZE people, and a median. */
function sideOf(
  row: { headcount: number; median: string | null } | undefined,
): GenderSide | null {
  if (!row || row.headcount < MIN_GROUP_SIZE || row.median === null) {
    return null;
  }
  return { headcount: row.headcount, medianUsd: row.median };
}

/**
 * The gap, only when BOTH sides are big enough. With 3 women at a level, "the women's median"
 * is close to one person's salary, so the comparison would single her out: the same privacy
 * rule as for a group, applied to each side.
 */
function gapOf(
  women: GenderSide | null,
  men: GenderSide | null,
): GenderGap | null {
  if (!women || !men) {
    return null;
  }
  // The change from the men's median to the women's: negative when women are paid less.
  return {
    women,
    men,
    gapPercent: percentChange(men.medianUsd, women.medianUsd),
  };
}

/**
 * The gap level by level, in numeric order, for the levels where both women and men number
 * at least MIN_GROUP_SIZE, and how many levels were left out for being too small on a side.
 */
export function pairGenderGaps(rows: GenderRow[]): {
  levels: GenderGapLevel[];
  hiddenLevels: number;
} {
  const present = [...new Set(rows.map((r) => r.level))].sort((a, b) => a - b);
  const levels = present.flatMap((level) => {
    const at = (gender: 'FEMALE' | 'MALE') =>
      sideOf(rows.find((r) => r.level === level && r.gender === gender));
    const gap = gapOf(at('FEMALE'), at('MALE'));
    return gap ? [{ level, label: `Level ${level}`, ...gap }] : [];
  });
  return { levels, hiddenLevels: present.length - levels.length };
}

/** The gap for everyone together, or null unless both sides have at least MIN_GROUP_SIZE people. */
export function pairOverallGap(rows: GenderOverallRow[]): GenderGap | null {
  return gapOf(
    sideOf(rows.find((r) => r.gender === 'FEMALE')),
    sideOf(rows.find((r) => r.gender === 'MALE')),
  );
}
