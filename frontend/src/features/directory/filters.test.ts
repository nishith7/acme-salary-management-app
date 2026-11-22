import { describe, expect, it } from 'vitest';
import {
  NO_FILTERS,
  countMoreFilters,
  hasActiveFilters,
  toEmployeeFilterQuery,
  type DirectoryFilters,
} from './filters.ts';

// The API answers 400 to an empty list or a blank search, so "nothing chosen" must never
// reach the request body as an empty value.
describe('the request body built from the filters', () => {
  it('is empty when nothing is chosen, which the API reads as everyone', () => {
    expect(toEmployeeFilterQuery(NO_FILTERS)).toEqual({});
  });

  it('leaves out a search that is only spaces', () => {
    expect(toEmployeeFilterQuery({ ...NO_FILTERS, search: '   ' })).toEqual({});
  });

  it('trims the search and carries every chosen filter', () => {
    expect(
      toEmployeeFilterQuery({
        search: '  ann ',
        statuses: ['ACTIVE'],
        countries: ['IN', 'US'],
        departments: ['Engineering'],
        bandPositions: ['BELOW'],
        levels: [3, 4],
        tenureBands: ['0-1'],
        jobTitles: ['Analyst'],
      }),
    ).toEqual({
      search: 'ann',
      statuses: ['ACTIVE'],
      countries: ['IN', 'US'],
      departments: ['Engineering'],
      bandPositions: ['BELOW'],
      levels: [3, 4],
      tenureBands: ['0-1'],
      jobTitles: ['Analyst'],
    });
  });
});

describe('whether any filter is on', () => {
  it('is off for the starting state and for a search of only spaces', () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...NO_FILTERS, search: '  ' })).toBe(false);
  });

  it.each<[string, Partial<DirectoryFilters>]>([
    ['countries', { countries: ['IN'] }],
    ['pay band', { bandPositions: ['BELOW'] }],
    ['levels', { levels: [3] }],
    ['tenure', { tenureBands: ['5+'] }],
    ['job titles', { jobTitles: ['Analyst'] }],
  ])('is on as soon as the %s filter has a value', (_name, change) => {
    expect(hasActiveFilters({ ...NO_FILTERS, ...change })).toBe(true);
  });

  it('counts only the filters kept under "More filters"', () => {
    expect(
      countMoreFilters({
        ...NO_FILTERS,
        countries: ['IN'],
        bandPositions: ['BELOW'],
      }),
    ).toBe(0);
    expect(
      countMoreFilters({
        ...NO_FILTERS,
        levels: [3, 4],
        tenureBands: ['5+'],
        jobTitles: ['Analyst'],
      }),
    ).toBe(3);
  });
});
