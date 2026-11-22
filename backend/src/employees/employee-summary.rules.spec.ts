import { showableSummary } from './employee-summary.rules.js';

describe('showableSummary', () => {
  const money = {
    totalAnnualUsd: '490000.00',
    medianUsd: '65000.00',
    averageUsd: '81666.67',
  };

  it('keeps every figure for exactly 5 current people, the smallest group that may be shown', () => {
    const row = { headcount: 7, counted: 5, ...money };

    expect(showableSummary(row)).toEqual(row);
  });

  it('hides the money for 4 current people even if the figures arrived, and keeps the counts', () => {
    expect(showableSummary({ headcount: 9, counted: 4, ...money })).toEqual({
      headcount: 9,
      counted: 4,
      totalAnnualUsd: null,
      medianUsd: null,
      averageUsd: null,
    });
  });

  it('shows no money when nobody is current, for example when only people who left match', () => {
    expect(
      showableSummary({
        headcount: 574,
        counted: 0,
        totalAnnualUsd: null,
        medianUsd: null,
        averageUsd: null,
      }),
    ).toEqual({
      headcount: 574,
      counted: 0,
      totalAnnualUsd: null,
      medianUsd: null,
      averageUsd: null,
    });
  });

  it('leaves a figure that did not arrive empty instead of inventing one', () => {
    expect(
      showableSummary({ headcount: 8, counted: 6, ...money, medianUsd: null }),
    ).toEqual({ headcount: 8, counted: 6, ...money, medianUsd: null });
  });
});
