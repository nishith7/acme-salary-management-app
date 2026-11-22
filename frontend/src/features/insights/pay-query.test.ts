import { describe, expect, it } from 'vitest';
import { hasPayFilters, toGenderGapQuery, toPayQuery } from './pay-query.ts';

// The API answers 400 to an empty list, so "nothing chosen" must never reach the body as one.
describe('the request body built from the choices', () => {
  it('names only the grouping when no filter is chosen', () => {
    expect(
      toPayQuery({ groupBy: 'country', countries: [], departments: [] }),
    ).toEqual({ groupBy: 'country' });
  });

  it('carries each filter that has a value', () => {
    expect(
      toPayQuery({
        groupBy: 'level',
        countries: ['IN', 'US'],
        departments: ['Engineering'],
      }),
    ).toEqual({
      groupBy: 'level',
      countries: ['IN', 'US'],
      departments: ['Engineering'],
    });
  });

  it('knows whether a filter is on', () => {
    expect(
      hasPayFilters({ groupBy: 'country', countries: [], departments: [] }),
    ).toBe(false);
    expect(
      hasPayFilters({ groupBy: 'country', countries: ['IN'], departments: [] }),
    ).toBe(true);
  });
});

describe('the gender gap request body', () => {
  it('is only the filters that are chosen: no grouping (it is always by level), and no empty lists', () => {
    expect(
      toGenderGapQuery({
        groupBy: 'department',
        countries: [],
        departments: [],
      }),
    ).toEqual({});
    expect(
      toGenderGapQuery({
        groupBy: 'level',
        countries: ['IN'],
        departments: ['Engineering'],
      }),
    ).toEqual({ countries: ['IN'], departments: ['Engineering'] });
  });
});
