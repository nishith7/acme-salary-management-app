import {
  MIN_GROUP_SIZE,
  pairGenderGaps,
  pairOverallGap,
  showableGroups,
  showableOverall,
  type GenderRow,
  type PayGroupRow,
  type PayStatsRow,
} from './insights.rules.js';

/** A group of `headcount` people with pay figures, as the database returns it. */
const group = (
  key: string,
  headcount: number,
  overrides: Partial<PayGroupRow> = {},
): PayGroupRow => ({
  key,
  label: key,
  headcount,
  p25: '50000.00',
  median: '60000.00',
  p75: '70000.00',
  total: '300000.00',
  ...overrides,
});

describe('the smallest group an insight may show', () => {
  it('is 5 people', () => {
    expect(MIN_GROUP_SIZE).toBe(5);
  });
});

// A median or a total over two or three people tells the reader roughly what each of them
// earns, so a group below the threshold never leaves the API, however it was produced.
describe('showableGroups', () => {
  it('keeps a group of exactly 5 and hides a group of 4, counting what it hid', () => {
    const { groups, hiddenGroups } = showableGroups(
      [group('IN', 5), group('DE', 4)],
      'country',
    );

    expect(groups.map((g) => g.key)).toEqual(['IN']);
    expect(hiddenGroups).toBe(1);
  });

  it('hides a small group even if the database sent its figures', () => {
    const { groups, hiddenGroups } = showableGroups(
      [group('XX', 2, { median: '123456.00' })],
      'country',
    );

    expect(groups).toEqual([]);
    expect(hiddenGroups).toBe(1);
  });

  it('hides a group that is big enough but arrived without figures, rather than show a blank', () => {
    const { groups, hiddenGroups } = showableGroups(
      [group('IN', 9, { median: null })],
      'country',
    );

    expect(groups).toEqual([]);
    expect(hiddenGroups).toBe(1);
  });

  it('sorts countries and departments by name, and levels by number (2 before 10)', () => {
    const byName = showableGroups(
      [
        group('b', 6, { label: 'Singapore' }),
        group('a', 6, { label: 'Germany' }),
      ],
      'country',
    );
    const byLevel = showableGroups(
      [
        group('10', 6, { label: 'Level 10' }),
        group('2', 6, { label: 'Level 2' }),
        group('1', 6, { label: 'Level 1' }),
      ],
      'level',
    );

    expect(byName.groups.map((g) => g.label)).toEqual(['Germany', 'Singapore']);
    expect(byLevel.groups.map((g) => g.label)).toEqual([
      'Level 1',
      'Level 2',
      'Level 10',
    ]);
  });

  it('gives the figures as they came, as text, never as numbers', () => {
    const { groups } = showableGroups([group('IN', 6)], 'country');

    expect(groups[0]).toEqual({
      key: 'IN',
      label: 'IN',
      headcount: 6,
      p25: '50000.00',
      median: '60000.00',
      p75: '70000.00',
      total: '300000.00',
    });
  });
});

describe('showableOverall', () => {
  const overall = (headcount: number): PayStatsRow => ({
    headcount,
    p25: '1.00',
    median: '2.00',
    p75: '3.00',
    total: '6.00',
  });

  it('gives the figures for 5 people or more, and nothing for fewer', () => {
    expect(showableOverall(overall(5))).toMatchObject({ headcount: 5 });
    expect(showableOverall(overall(4))).toBeNull();
    expect(showableOverall(overall(0))).toBeNull();
  });
});

// The gender pay gap compares the median pay of women and of men. It is only ever shown when
// BOTH sides are at least 5 people: with 3 women in a level, "the women's median" is nearly
// one person's salary.
describe('pairGenderGaps', () => {
  const row = (
    level: number,
    gender: 'FEMALE' | 'MALE',
    headcount: number,
    median: string | null,
  ): GenderRow => ({ level, gender, headcount, median });

  it('compares the women’s median with the men’s, as a percentage of the men’s, negative when women are paid less', () => {
    const { levels } = pairGenderGaps([
      row(2, 'FEMALE', 5, '70000.00'),
      row(2, 'MALE', 5, '90000.00'),
    ]);

    expect(levels).toEqual([
      {
        level: 2,
        label: 'Level 2',
        women: { headcount: 5, medianUsd: '70000.00' },
        men: { headcount: 5, medianUsd: '90000.00' },
        // (70,000 - 90,000) / 90,000 = -22.2%
        gapPercent: '-22.2',
      },
    ]);
  });

  it('gives a positive gap when the women’s median is higher, and 0.0 when they are equal', () => {
    const { levels } = pairGenderGaps([
      row(1, 'FEMALE', 6, '110000.00'),
      row(1, 'MALE', 6, '100000.00'),
      row(2, 'FEMALE', 6, '50000.00'),
      row(2, 'MALE', 6, '50000.00'),
    ]);

    expect(levels.map((l) => l.gapPercent)).toEqual(['10.0', '0.0']);
  });

  it('hides a level unless BOTH sides have at least 5 people, and counts what it hid', () => {
    const { levels, hiddenLevels } = pairGenderGaps([
      row(1, 'FEMALE', 5, '1.00'),
      row(1, 'MALE', 5, '1.00'),
      row(2, 'FEMALE', 4, '1.00'), // 4 women: hidden
      row(2, 'MALE', 50, '1.00'),
      row(3, 'MALE', 9, '1.00'), // no women at all: hidden
    ]);

    expect(levels.map((l) => l.level)).toEqual([1]);
    expect(hiddenLevels).toBe(2);
  });

  it('hides a level whose side arrived with no median, rather than show a blank', () => {
    const { levels, hiddenLevels } = pairGenderGaps([
      row(1, 'FEMALE', 8, null),
      row(1, 'MALE', 8, '1.00'),
    ]);

    expect(levels).toEqual([]);
    expect(hiddenLevels).toBe(1);
  });

  it('puts the levels in numeric order (2 before 10)', () => {
    const rows = [10, 2, 1].flatMap((level) => [
      row(level, 'FEMALE', 6, '10.00'),
      row(level, 'MALE', 6, '10.00'),
    ]);

    expect(pairGenderGaps(rows).levels.map((l) => l.level)).toEqual([1, 2, 10]);
  });
});

describe('pairOverallGap', () => {
  it('gives the gap for everyone together when both sides have at least 5 people, and nothing otherwise', () => {
    expect(
      pairOverallGap([
        { gender: 'FEMALE', headcount: 11, median: '100000.00' },
        { gender: 'MALE', headcount: 9, median: '110000.00' },
      ]),
    ).toEqual({
      women: { headcount: 11, medianUsd: '100000.00' },
      men: { headcount: 9, medianUsd: '110000.00' },
      gapPercent: '-9.1',
    });
    expect(
      pairOverallGap([
        { gender: 'FEMALE', headcount: 4, median: null },
        { gender: 'MALE', headcount: 9, median: '110000.00' },
      ]),
    ).toBeNull();
    expect(pairOverallGap([])).toBeNull();
  });
});
