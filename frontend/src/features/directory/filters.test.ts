import { describe, expect, it } from 'vitest';
import {
  NO_FILTERS,
  hasActiveFilters,
  toEmployeeFilterQuery,
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
      }),
    ).toEqual({
      search: 'ann',
      statuses: ['ACTIVE'],
      countries: ['IN', 'US'],
      departments: ['Engineering'],
    });
  });
});

describe('whether any filter is on', () => {
  it('is off for the starting state and for a search of only spaces', () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...NO_FILTERS, search: '  ' })).toBe(false);
  });

  it('is on as soon as one filter has a value', () => {
    expect(hasActiveFilters({ ...NO_FILTERS, countries: ['IN'] })).toBe(true);
  });
});
