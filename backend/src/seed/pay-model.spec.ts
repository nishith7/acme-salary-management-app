import { midpointPay, PAY_MODEL } from './pay-model.js';
import { COUNTRIES, DEPARTMENTS } from './reference-data.js';

describe('pay model', () => {
  // The worked examples of the approved proposal, for a level 3 engineer.
  it.each([
    ['US', 'USD', 119_000],
    ['IN', 'INR', 2_960_000],
    ['DE', 'EUR', 92_900],
    ['JP', 'JPY', 12_500_000],
  ])(
    'puts a level 3 engineer in %s at %s %s',
    (countryCode, currencyCode, expected) => {
      expect(
        midpointPay({
          level: 3,
          countryCode,
          currencyCode,
          departmentName: 'Engineering',
        }),
      ).toBe(expected);
    },
  );

  it('covers every country, currency and department of the reference data, so the seed cannot fail halfway on a missing one', () => {
    for (const country of COUNTRIES) {
      expect(PAY_MODEL.countryPayIndex[country.code]).toBeGreaterThan(0);
      expect(PAY_MODEL.unitsPerUsd[country.currencyCode]).toBeGreaterThan(0);
    }
    for (const department of DEPARTMENTS) {
      expect(PAY_MODEL.departmentFactor[department.name]).toBeGreaterThan(0);
    }
  });
});
