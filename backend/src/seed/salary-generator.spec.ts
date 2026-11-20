import {
  generateEmployees,
  SEED_AS_OF,
  type GeneratedEmployee,
} from './employee-generator.js';
import { BAND_HALF_WIDTH, midpointPay } from './pay-model.js';
import { COUNTRIES } from './reference-data.js';
import {
  generateSalaryHistory,
  type GeneratedSalaryRecord,
  type SalaryEmployee,
} from './salary-generator.js';

const asOf = SEED_AS_OF;
const DAY_MS = 24 * 60 * 60 * 1000;
const currencyOf = new Map(COUNTRIES.map((c) => [c.code, c.currencyCode]));

const toSalaryEmployee = (e: GeneratedEmployee): SalaryEmployee => ({
  employeeCode: e.employeeCode,
  gender: e.gender,
  level: e.level,
  countryCode: e.countryCode,
  currencyCode: currencyOf.get(e.countryCode)!,
  departmentName: e.departmentName,
  joiningDate: e.joiningDate,
  terminatedOn: e.terminatedOn,
});

/** The salary in force on each date: the record created last wins when two share a date. */
function inForce(history: GeneratedSalaryRecord[]): GeneratedSalaryRecord[] {
  const byDate = new Map<number, GeneratedSalaryRecord>();
  for (const record of history) {
    const key = record.effectiveFrom.getTime();
    const seen = byDate.get(key);
    if (!seen || record.createdAt > seen.createdAt) {
      byDate.set(key, record);
    }
  }
  return [...byDate.values()].sort(
    (a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime(),
  );
}

describe('generateSalaryHistory, for the 10,000 seeded employees', () => {
  const people = generateEmployees({ count: 10_000, asOf }).map(
    toSalaryEmployee,
  );
  const population = people.map((person) => ({
    person,
    history: generateSalaryHistory(person, { asOf }),
  }));
  /** Codes of the people who break a rule, so a failure names them. */
  const breaking = (rule: (p: (typeof population)[number]) => boolean) =>
    population.filter((p) => !rule(p)).map((p) => p.person.employeeCode);

  it('starts with exactly one hire record, on the joining date', () => {
    expect(
      breaking(
        ({ person, history }) =>
          history[0]!.reason === 'HIRE' &&
          history[0]!.effectiveFrom.getTime() ===
            person.joiningDate.getTime() &&
          history.filter((r) => r.reason === 'HIRE').length === 1,
      ),
    ).toEqual([]);
  });

  it('has no change after the as-of date, on or after a leaver’s last day, or recorded in the future', () => {
    expect(
      breaking(({ person, history }) =>
        history.every(
          (r) =>
            r.effectiveFrom.getTime() <= asOf.getTime() &&
            r.createdAt.getTime() <= asOf.getTime() &&
            (person.terminatedOn === null ||
              r.effectiveFrom.getTime() < person.terminatedOn.getTime()),
        ),
      ),
    ).toEqual([]);
  });

  it('uses the person’s own currency and a whole, positive amount on every record', () => {
    expect(
      breaking(({ person, history }) =>
        history.every(
          (r) =>
            r.currencyCode === person.currencyCode &&
            Number.isSafeInteger(r.annualAmount) &&
            r.annualAmount > 0,
        ),
      ),
    ).toEqual([]);
  });

  it('never cuts pay: the salary in force rises at every change', () => {
    expect(
      breaking(({ history }) => {
        const series = inForce(history).map((r) => r.annualAmount);
        return series.every((amount, i) => i === 0 || amount > series[i - 1]!);
      }),
    ).toEqual([]);
  });

  it('shares an effective date between two records only when the second is a correction, recorded 10 to 60 days later', () => {
    expect(
      breaking(({ history }) => {
        const dates = new Map<number, GeneratedSalaryRecord[]>();
        for (const r of history) {
          const key = r.effectiveFrom.getTime();
          dates.set(key, [...(dates.get(key) ?? []), r]);
        }
        return [...dates.values()].every(([first, second, ...rest]) => {
          if (!second) return first!.reason !== 'CORRECTION';
          const gapDays =
            (second.createdAt.getTime() - first!.createdAt.getTime()) / DAY_MS;
          return (
            rest.length === 0 &&
            second.reason === 'CORRECTION' &&
            gapDays >= 10 &&
            gapDays <= 60
          );
        });
      }),
    ).toEqual([]);
  });

  it('is reproducible and depends only on the person, never on who was generated before them', () => {
    const some = people.slice(0, 30);
    const inOrder = some.map((p) => generateSalaryHistory(p, { asOf }));

    const backwards = [...some]
      .reverse()
      .map((p) => generateSalaryHistory(p, { asOf }))
      .reverse();

    expect(backwards).toEqual(inOrder);
  });

  // This is what the pay insights are for, so a regression here would quietly
  // leave the demo with nothing to find.
  it('has the pay patterns the insights rely on: women about 4% lower, and some people well under and well over their band', () => {
    const mean = (values: number[]) =>
      values.reduce((sum, v) => sum + v, 0) / values.length;
    const ratios = population.map(({ person, history }) => ({
      gender: person.gender,
      ratio: inForce(history).at(-1)!.annualAmount / midpointPay(person),
    }));
    const meanLog = (gender: string) =>
      mean(
        ratios.filter((r) => r.gender === gender).map((r) => Math.log(r.ratio)),
      );

    const gap = 1 - Math.exp(meanLog('FEMALE') - meanLog('MALE'));

    expect(gap).toBeGreaterThan(0.02);
    expect(gap).toBeLessThan(0.06);
    expect(
      ratios.filter((r) => r.ratio < 1 - BAND_HALF_WIDTH).length,
    ).toBeGreaterThan(100);
    expect(
      ratios.filter((r) => r.ratio > 1 + BAND_HALF_WIDTH).length,
    ).toBeGreaterThan(100);
  });
});
