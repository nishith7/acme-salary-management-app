import {
  MIN_GROUP_SIZE,
  showableGroups,
  showableOverall,
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
