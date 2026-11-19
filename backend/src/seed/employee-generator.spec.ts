import { generateEmployees } from './employee-generator.js';
import type { GeneratedEmployee } from './employee-generator.js';
import { LOCALES } from './locales.js';
import { COUNTRIES, DEPARTMENTS, MAX_LEVEL } from './reference-data.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const asOf = new Date('2026-11-01T00:00:00.000Z');

const isUtcMidnight = (date: Date) => date.getTime() % DAY_MS === 0;
const share = (
  people: GeneratedEmployee[],
  test: (e: GeneratedEmployee) => boolean,
) => people.filter(test).length / people.length;
/** How far an observed share may stray from its true probability: 4 standard errors. */
const tolerance = (p: number, n: number) => 4 * Math.sqrt((p * (1 - p)) / n);
const tenureDays = (e: GeneratedEmployee) =>
  (asOf.getTime() - e.joiningDate.getTime()) / DAY_MS;

describe('reference data', () => {
  it('has 15 countries, each with a code, a currency and a name locale that exists', () => {
    expect(COUNTRIES).toHaveLength(15);
    for (const country of COUNTRIES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/);
      expect(country.currencyCode).toMatch(/^[A-Z]{3}$/);
      expect(LOCALES[country.locale]).toBeDefined();
    }
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
  });

  it('has weights that add up to 1 for countries and for departments', () => {
    const sum = (weights: number[]) => weights.reduce((a, b) => a + b, 0);

    expect(sum(COUNTRIES.map((c) => c.weight))).toBeCloseTo(1, 10);
    expect(sum(DEPARTMENTS.map((d) => d.weight))).toBeCloseTo(1, 10);
  });

  it('gives every department one job title per level, all different', () => {
    for (const department of DEPARTMENTS) {
      expect(department.titles).toHaveLength(MAX_LEVEL);
      expect(new Set(department.titles).size).toBe(MAX_LEVEL);
    }
    expect(new Set(DEPARTMENTS.map((d) => d.name)).size).toBe(
      DEPARTMENTS.length,
    );
  });
});

describe('generateEmployees', () => {
  describe('a small batch', () => {
    const batch = generateEmployees({ count: 200, seed: 1, asOf });

    it('returns exactly the number asked for, and nothing for zero', () => {
      expect(batch).toHaveLength(200);
      expect(generateEmployees({ count: 0, seed: 1, asOf })).toEqual([]);
    });

    it.each([-1, 1.5, Number.NaN])('refuses a count of %s', (count) => {
      expect(() => generateEmployees({ count })).toThrow(RangeError);
    });

    it('numbers the employees EMP-00001, EMP-00002 and so on, all different', () => {
      expect(batch[0]!.employeeCode).toBe('EMP-00001');
      expect(batch[199]!.employeeCode).toBe('EMP-00200');
      expect(new Set(batch.map((e) => e.employeeCode)).size).toBe(200);
    });

    it('uses the code prefix it is given', () => {
      const tagged = generateEmployees({
        count: 2,
        seed: 1,
        asOf,
        codePrefix: 'TST',
      });

      expect(tagged.map((e) => e.employeeCode)).toEqual([
        'TST-00001',
        'TST-00002',
      ]);
    });

    it('is reproducible: the same options give identical employees', () => {
      expect(generateEmployees({ count: 200, seed: 1, asOf })).toEqual(batch);
    });

    it('gives different employees for a different seed', () => {
      const other = generateEmployees({ count: 200, seed: 2, asOf });

      expect(other.map((e) => e.fullName)).not.toEqual(
        batch.map((e) => e.fullName),
      );
    });

    it('has defaults for the seed and the as-of date, so a bare call is reproducible too', () => {
      expect(generateEmployees({ count: 50 })).toEqual(
        generateEmployees({ count: 50 }),
      );
    });

    it('keeps the first employees unchanged when more are asked for, so re-running with a bigger count only adds', () => {
      const larger = generateEmployees({ count: 500, seed: 1, asOf });

      expect(larger.slice(0, 200)).toEqual(batch);
    });

    it('gives every employee valid, complete details', () => {
      const countryCodes = new Set(COUNTRIES.map((c) => c.code));
      const departmentNames = new Set(DEPARTMENTS.map((d) => d.name));

      for (const e of batch) {
        expect(e.fullName.trim().length).toBeGreaterThanOrEqual(2);
        expect(['FEMALE', 'MALE', 'OTHER']).toContain(e.gender);
        expect(Number.isInteger(e.level)).toBe(true);
        expect(e.level).toBeGreaterThanOrEqual(1);
        expect(e.level).toBeLessThanOrEqual(MAX_LEVEL);
        expect(countryCodes.has(e.countryCode)).toBe(true);
        expect(departmentNames.has(e.departmentName)).toBe(true);
      }
    });

    it('gives each employee the job title of their department at their level', () => {
      for (const e of batch) {
        const department = DEPARTMENTS.find(
          (d) => d.name === e.departmentName,
        )!;
        expect(e.jobTitle).toBe(department.titles[e.level - 1]);
      }
    });

    it('joins people on plain calendar dates, no later than the as-of date and within 12 years of it', () => {
      const earliest = asOf.getTime() - 12 * 365 * DAY_MS;

      for (const e of batch) {
        expect(isUtcMidnight(e.joiningDate)).toBe(true);
        expect(e.joiningDate.getTime()).toBeLessThanOrEqual(asOf.getTime());
        expect(e.joiningDate.getTime()).toBeGreaterThanOrEqual(earliest);
      }
    });

    it('keeps status and termination date consistent: terminated people have a date after they joined, active people have none', () => {
      const leavers = batch.filter((e) => e.status === 'TERMINATED');
      expect(leavers.length).toBeGreaterThan(0);

      for (const e of batch) {
        if (e.status === 'ACTIVE') {
          expect(e.terminatedOn).toBeNull();
        } else {
          expect(e.terminatedOn).not.toBeNull();
          expect(isUtcMidnight(e.terminatedOn!)).toBe(true);
          expect(e.terminatedOn!.getTime()).toBeGreaterThanOrEqual(
            e.joiningDate.getTime() + 30 * DAY_MS,
          );
          expect(e.terminatedOn!.getTime()).toBeLessThanOrEqual(asOf.getTime());
        }
      }
    });

    it('does not mix up dates when a different as-of date is given', () => {
      const earlier = new Date('2020-06-30T00:00:00.000Z');

      const people = generateEmployees({ count: 300, seed: 1, asOf: earlier });

      for (const e of people) {
        expect(e.joiningDate.getTime()).toBeLessThanOrEqual(earlier.getTime());
        if (e.terminatedOn) {
          expect(e.terminatedOn.getTime()).toBeLessThanOrEqual(
            earlier.getTime(),
          );
        }
      }
    });
  });

  // The full dataset the requirements ask for. It is deterministic, so these
  // checks cannot flake; the tolerances are four standard errors wide.
  describe('the full 10,000 employees', () => {
    const N = 10_000;
    const people = generateEmployees({ count: N });

    it('has 10,000 employees with 10,000 different codes', () => {
      expect(people).toHaveLength(N);
      expect(new Set(people.map((e) => e.employeeCode)).size).toBe(N);
      expect(people.every((e) => /^EMP-\d{5}$/.test(e.employeeCode))).toBe(
        true,
      );
    });

    it('uses every country, department and level', () => {
      expect(new Set(people.map((e) => e.countryCode)).size).toBe(
        COUNTRIES.length,
      );
      expect(new Set(people.map((e) => e.departmentName)).size).toBe(
        DEPARTMENTS.length,
      );
      expect(new Set(people.map((e) => e.level)).size).toBe(MAX_LEVEL);
    });

    it('spreads people across countries in line with the weights', () => {
      for (const country of COUNTRIES) {
        const observed = share(people, (e) => e.countryCode === country.code);
        expect(Math.abs(observed - country.weight)).toBeLessThan(
          tolerance(country.weight, N),
        );
      }
    });

    it('spreads people across departments in line with the weights', () => {
      for (const department of DEPARTMENTS) {
        const observed = share(
          people,
          (e) => e.departmentName === department.name,
        );
        expect(Math.abs(observed - department.weight)).toBeLessThan(
          tolerance(department.weight, N),
        );
      }
    });

    it('gives people names in the script of their country: native script for Japan, the UAE and Singapore, Latin letters everywhere else', () => {
      const nativeScript: Record<string, RegExp> = {
        JP: /[぀-ヿ㐀-鿿]/u,
        AE: /[؀-ۿ]/u,
        SG: /[㐀-鿿]/u,
      };

      for (const e of people) {
        const native = nativeScript[e.countryCode];
        if (native) {
          expect(e.fullName).toMatch(native);
        } else {
          expect(e.fullName).toMatch(/^[\p{Script=Latin}\s'.-]+$/u);
        }
      }
    });

    it('is shaped like a pyramid: most people are junior or mid level, very few are at the top', () => {
      expect(share(people, (e) => e.level <= 3)).toBeGreaterThan(0.7);
      expect(share(people, (e) => e.level <= 3)).toBeLessThan(0.85);
      expect(share(people, (e) => e.level === MAX_LEVEL)).toBeLessThan(0.02);
      const counts = Array.from(
        { length: MAX_LEVEL },
        (_, i) => people.filter((e) => e.level === i + 1).length,
      );
      // From level 2 upward every level is smaller than the one below it.
      for (let level = 2; level < MAX_LEVEL; level++) {
        expect(counts[level]!).toBeLessThan(counts[level - 1]!);
      }
    });

    it('has a believable share of people who have left', () => {
      const leavers = share(people, (e) => e.status === 'TERMINATED');

      expect(leavers).toBeGreaterThan(0.04);
      expect(leavers).toBeLessThan(0.09);
    });

    // Checked across all of the leavers (about 600), not a small batch: with a
    // few leavers an early-exit bug can easily go unseen.
    it('has leavers who all stayed at least 30 days and left no later than the as-of date, and no active person with a leaving date', () => {
      const leavers = people.filter((e) => e.status === 'TERMINATED');
      expect(leavers.length).toBeGreaterThan(400);

      for (const e of leavers) {
        expect(e.terminatedOn!.getTime()).toBeGreaterThanOrEqual(
          e.joiningDate.getTime() + 30 * DAY_MS,
        );
        expect(e.terminatedOn!.getTime()).toBeLessThanOrEqual(asOf.getTime());
      }
      expect(
        people.filter((e) => e.status === 'ACTIVE' && e.terminatedOn !== null),
      ).toHaveLength(0);
    });

    it('has both genders at every level, in numbers large enough that the pay-gap insight is never hidden by the privacy threshold', () => {
      for (let level = 1; level <= MAX_LEVEL; level++) {
        const atLevel = people.filter((e) => e.level === level);
        expect(
          atLevel.filter((e) => e.gender === 'FEMALE').length,
        ).toBeGreaterThanOrEqual(5);
        expect(
          atLevel.filter((e) => e.gender === 'MALE').length,
        ).toBeGreaterThanOrEqual(5);
      }
    });

    it('is deliberately not perfectly balanced, so the gender insight has something to find: far fewer women in engineering than in people operations, and at least 6 percentage points fewer at the top than at the bottom', () => {
      const womenIn = (department: string) =>
        share(
          people.filter((e) => e.departmentName === department),
          (e) => e.gender === 'FEMALE',
        );
      const womenAt = (test: (level: number) => boolean) =>
        share(
          people.filter((e) => test(e.level)),
          (e) => e.gender === 'FEMALE',
        );

      expect(womenIn('Engineering')).toBeLessThan(
        womenIn('People Operations') - 0.2,
      );
      // About 400 people sit at the top, so a bare "is lower" would pass by luck
      // about half the time if the effect were removed. A clear margin does not.
      expect(womenAt((l) => l >= MAX_LEVEL - 1)).toBeLessThan(
        womenAt((l) => l <= 2) - 0.06,
      );
    });

    it('does not repeat the same names in countries that share a locale, such as the US, the UK and Canada', () => {
      const firstNamesIn = (code: string) =>
        people
          .filter((e) => e.countryCode === code)
          .slice(0, 50)
          .map((e) => e.fullName);
      const sameAtSamePosition = (a: string[], b: string[]) =>
        a.filter((name, index) => name === b[index]).length;

      // With one shared seed these would match about every other position.
      expect(
        sameAtSamePosition(firstNamesIn('US'), firstNamesIn('GB')),
      ).toBeLessThan(5);
      expect(
        sameAtSamePosition(firstNamesIn('US'), firstNamesIn('CA')),
      ).toBeLessThan(5);
    });

    it('has a small share of people who are neither female nor male', () => {
      const other = share(people, (e) => e.gender === 'OTHER');

      expect(other).toBeGreaterThan(0.005);
      expect(other).toBeLessThan(0.04);
    });

    it('has more recent joiners than old ones, and senior people who have been there longer', () => {
      expect(share(people, (e) => tenureDays(e) < 4 * 365)).toBeGreaterThan(
        share(people, (e) => tenureDays(e) > 8 * 365),
      );
      const meanTenure = (level: number) => {
        const atLevel = people.filter((e) => e.level === level);
        return (
          atLevel.reduce((sum, e) => sum + tenureDays(e), 0) / atLevel.length
        );
      };
      expect(meanTenure(MAX_LEVEL)).toBeGreaterThan(meanTenure(1) + 365);
    });
  });
});
