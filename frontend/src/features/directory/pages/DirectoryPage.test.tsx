import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi, employeesApi } from '../../../api/index.ts';
import { renderApp } from '../../../test/render-app.tsx';

/** The last body the page sent to `QUERY /employees`. */
function lastQuery(list: ReturnType<typeof vi.spyOn>) {
  return list.mock.lastCall?.[0] as Record<string, unknown>;
}

let list: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.spyOn(authApi, 'restoreSession').mockResolvedValue({
    accessToken: 'token',
    expiresIn: 900,
    user: {
      id: 'u1',
      email: 'hr@acme.test',
      name: 'Hana Rao',
      role: 'HR_ADMIN',
    },
  });
  vi.spyOn(employeesApi, 'filterOptions').mockResolvedValue({
    countries: [
      { code: 'IN', name: 'India' },
      { code: 'US', name: 'United States' },
    ],
    departments: ['Engineering', 'Finance'],
  });
  // 1,000 matches, so there are pages to move between.
  list = vi
    .spyOn(employeesApi, 'list')
    .mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 1000 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function openDirectory() {
  renderApp('/employees');
  // The dropdowns are disabled until the country and department lists arrive.
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Country' }),
    ).not.toHaveAttribute('aria-disabled', 'true'),
  );
}

async function choose(
  user: ReturnType<typeof userEvent.setup>,
  filter: 'Country' | 'Department',
  option: string,
) {
  await user.click(screen.getByRole('combobox', { name: filter }));
  await user.click(
    await within(await screen.findByRole('listbox')).findByRole('option', {
      name: option,
    }),
  );
  await user.keyboard('{Escape}'); // close the menu
}

describe('searching the directory', () => {
  it('searches once typing pauses, not once per letter, and ignores spaces around the text', async () => {
    const user = userEvent.setup();
    await openDirectory();
    list.mockClear();

    await user.type(
      screen.getByRole('textbox', { name: /search employees/i }),
      ' ann ',
    );

    await waitFor(() =>
      expect(lastQuery(list)).toMatchObject({ search: 'ann' }),
    );
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('shows everyone again as soon as the search is cleared', async () => {
    const user = userEvent.setup();
    await openDirectory();
    await user.type(
      screen.getByRole('textbox', { name: /search employees/i }),
      'ann',
    );
    await waitFor(() =>
      expect(lastQuery(list)).toMatchObject({ search: 'ann' }),
    );

    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    await waitFor(() => expect(lastQuery(list)).not.toHaveProperty('search'));
  });
});

describe('filtering the directory', () => {
  it('asks for the chosen countries by code, and for status, then for everyone again after "Clear filters"', async () => {
    const user = userEvent.setup();
    await openDirectory();

    await choose(user, 'Country', 'India');
    await choose(user, 'Country', 'United States');
    await user.click(screen.getByRole('button', { name: 'Left' }));

    await waitFor(() =>
      expect(lastQuery(list)).toMatchObject({
        countries: ['IN', 'US'],
        statuses: ['TERMINATED'],
      }),
    );
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveTextContent(
      '2 countries',
    );

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    await waitFor(() => {
      expect(lastQuery(list)).not.toHaveProperty('countries');
      expect(lastQuery(list)).not.toHaveProperty('statuses');
    });
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('goes back to page 1 when a filter changes, because the old page may not exist in the new list', async () => {
    const user = userEvent.setup();
    await openDirectory();
    await user.click(screen.getByRole('button', { name: 'Go to next page' }));
    await waitFor(() => expect(lastQuery(list)).toMatchObject({ page: 2 }));

    await choose(user, 'Department', 'Finance');

    await waitFor(() =>
      expect(lastQuery(list)).toMatchObject({
        departments: ['Finance'],
        page: 1,
        pageSize: 25,
      }),
    );
  });
});
