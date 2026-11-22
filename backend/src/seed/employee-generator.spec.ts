import { generateEmployees } from './employee-generator.js';
import { COUNTRIES, DEPARTMENTS, MAX_LEVEL } from './reference-data.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const asOf = new Date('2026-11-01T00:00:00.000Z');

const isUtcMidnight = (date: Date) => date.getTime() % DAY_MS === 0;

describe('reference data', () => {
  it('has weights that add up to 1 for countries and for departments', () => {
    const sum = (weights: number[]) => weights.reduce((a, b) => a + b, 0);

    expect(sum(COUNTRIES.map((c) => c.weight))).toBeCloseTo(1, 10);
    expect(sum(DEPARTMENTS.map((d) => d.weight))).toBeCloseTo(1, 10);
  });
});

describe('generateEmployees', () => {
  const batch = generateEmployees({ count: 200, seed: 1, asOf });

  it('returns exactly the number asked for, and refuses a count that is not a whole number of at least 0', () => {
    expect(batch).toHaveLength(200);
    expect(generateEmployees({ count: 0, seed: 1, asOf })).toEqual([]);
    for (const count of [-1, 1.5, Number.NaN]) {
      expect(() => generateEmployees({ count })).toThrow(RangeError);
    }
  });

  it('numbers the employees EMP-00001, EMP-00002 and so on, all different', () => {
    expect(batch[0]!.employeeCode).toBe('EMP-00001');
    expect(batch[199]!.employeeCode).toBe('EMP-00200');
    expect(new Set(batch.map((e) => e.employeeCode)).size).toBe(200);
  });

  it('is reproducible: the same options give identical employees', () => {
    expect(generateEmployees({ count: 200, seed: 1, asOf })).toEqual(batch);
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
      const department = DEPARTMENTS.find((d) => d.name === e.departmentName)!;
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

  // The full dataset the requirements ask for. It is deterministic, so this cannot flake.
  it('makes the 10,000 employees the requirements ask for, with 10,000 different codes', () => {
    const people = generateEmployees({ count: 10_000 });

    expect(people).toHaveLength(10_000);
    expect(new Set(people.map((e) => e.employeeCode)).size).toBe(10_000);
    expect(people.every((e) => /^EMP-\d{5}$/.test(e.employeeCode))).toBe(true);
  });
});
