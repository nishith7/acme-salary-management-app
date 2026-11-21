import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { SORT_FIELDS, type EmployeeListItem } from '../../../api/employees.ts';
import { employeeColumns } from '../columns.tsx';
import {
  EmployeeTable,
  type TablePagination,
  type TableSort,
} from './EmployeeTable.tsx';

const person: EmployeeListItem = {
  id: 'e1',
  employeeCode: 'EMP-00001',
  fullName: 'Aarav Ali',
  jobTitle: 'Staff Engineer',
  level: 6,
  department: 'Engineering',
  country: { code: 'IN', name: 'India' },
  joiningDate: '2021-03-01',
  status: 'ACTIVE',
  terminatedOn: null,
  tenureBand: '3-5',
  currentSalary: {
    annualAmount: '4500000.00',
    currencyCode: 'INR',
    annualAmountUsd: '54216.87',
  },
  bandPosition: 'BELOW',
};

function renderTable(props: Partial<Parameters<typeof EmployeeTable>[0]> = {}) {
  const onPaginationChange = vi.fn();
  const onSortChange = vi.fn();
  // The name is a link to the profile, so the table needs a router around it.
  render(
    <MemoryRouter>
      <EmployeeTable
        rows={[person]}
        total={100}
        loading={false}
        pagination={{ page: 1, pageSize: 25 }}
        sort={{ sortBy: 'fullName', sortOrder: 'asc' }}
        onPaginationChange={onPaginationChange}
        onSortChange={onSortChange}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onPaginationChange, onSortChange };
}

/** The table driven by real state, the way DirectoryPage drives it. */
function Harness() {
  const [pagination, setPagination] = useState<TablePagination>({
    page: 1,
    pageSize: 25,
  });
  const [sort, setSort] = useState<TableSort>({
    sortBy: 'fullName',
    sortOrder: 'asc',
  });
  return (
    <MemoryRouter>
      <output data-testid="state">{`page ${pagination.page}, ${pagination.pageSize} rows, ${sort.sortBy} ${sort.sortOrder}`}</output>
      <EmployeeTable
        rows={[person]}
        total={1000}
        loading={false}
        pagination={pagination}
        sort={sort}
        onPaginationChange={setPagination}
        // Like the page: choosing a new sort goes back to the first page.
        onSortChange={(next) => {
          setSort(next);
          setPagination((current) => ({ ...current, page: 1 }));
        }}
      />
    </MemoryRouter>
  );
}

describe('the employee table', () => {
  it('asks for the next page, and only for that, when the next-page button is pressed', async () => {
    const { onPaginationChange, onSortChange } = renderTable();

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Go to next page' }));

    expect(onPaginationChange).toHaveBeenCalledExactlyOnceWith({
      page: 2,
      pageSize: 25,
    });
    // The page number is what changed, so the sort must be left alone: a sort change makes
    // the page reset to 1, which would swallow the click.
    expect(onSortChange).not.toHaveBeenCalled();
  });

  it('stays on the page that was asked for once the table has re-rendered with it', async () => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Go to next page' }));
    await user.click(screen.getByRole('button', { name: 'Go to next page' }));

    // Wait past any follow-up events the grid sends after a page change.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent(
        'page 3, 25 rows, fullName asc',
      ),
    );
  });

  it('goes back to the first page when the page size changes', async () => {
    const { onPaginationChange } = renderTable({
      pagination: { page: 3, pageSize: 25 },
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole('combobox', { name: /rows per page/i }));
    await user.click(await screen.findByRole('option', { name: '100' }));

    expect(onPaginationChange).toHaveBeenCalledExactlyOnceWith({
      page: 1,
      pageSize: 100,
    });
  });

  it('offers pages of 25, 50 and 100 rows, the most the API and the free grid allow', async () => {
    renderTable();

    await userEvent
      .setup()
      .click(screen.getByRole('combobox', { name: /rows per page/i }));

    const options = within(await screen.findByRole('listbox')).getAllByRole(
      'option',
    );
    expect(options.map((o) => o.textContent)).toEqual(['25', '50', '100']);
  });

  it('sorts by the API field of a clicked column, and flips the direction on a second click', async () => {
    const user = userEvent.setup();
    const first = renderTable();

    await user.click(
      screen.getByRole('columnheader', { name: /salary \(usd\)/i }),
    );
    expect(first.onSortChange).toHaveBeenCalledExactlyOnceWith({
      sortBy: 'salaryUsd',
      sortOrder: 'asc',
    });
  });

  it('flips to descending when the column it is sorted by is clicked again', async () => {
    const { onSortChange } = renderTable({
      sort: { sortBy: 'salaryUsd', sortOrder: 'asc' },
    });

    await userEvent
      .setup()
      .click(screen.getByRole('columnheader', { name: /salary \(usd\)/i }));

    expect(onSortChange).toHaveBeenCalledExactlyOnceWith({
      sortBy: 'salaryUsd',
      sortOrder: 'desc',
    });
  });

  it('shows the message and a way to try again, instead of the table, when the page could not be loaded', async () => {
    const onRetry = vi.fn();
    renderTable({ error: 'Internal server error', onRetry });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load employees. Internal server error',
    );
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('the employee columns', () => {
  it('sort only by fields the API accepts, so a header click can never ask for an invalid sort', () => {
    const sortable = employeeColumns.filter((c) => c.sortable !== false);

    expect(sortable.length).toBeGreaterThan(0);
    for (const column of sortable) {
      expect(SORT_FIELDS as readonly string[]).toContain(column.field);
    }
  });
});
