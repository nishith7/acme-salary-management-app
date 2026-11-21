import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { ApiError } from '../../../api/index.ts';
import { paths } from '../../../app/paths.ts';
import { DirectoryFilters } from '../components/DirectoryFilters.tsx';
import {
  EmployeeTable,
  type TablePagination,
  type TableSort,
} from '../components/EmployeeTable.tsx';
import {
  NO_FILTERS,
  hasActiveFilters,
  toEmployeeFilterQuery,
  type DirectoryFilters as Filters,
} from '../filters.ts';
import { useEmployees } from '../use-employees.ts';

const countFormat = new Intl.NumberFormat('en-US');

export function DirectoryPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [pagination, setPagination] = useState<TablePagination>({
    page: 1,
    pageSize: 25,
  });
  const [sort, setSort] = useState<TableSort>({
    sortBy: 'fullName',
    sortOrder: 'asc',
  });
  const employees = useEmployees({
    ...toEmployeeFilterQuery(filters),
    ...pagination,
    ...sort,
  });

  function handleSortChange(next: TableSort) {
    setSort(next);
    setPagination((current) => ({ ...current, page: 1 }));
  }

  // A different filter is a different list, so page 3 of the old one means nothing: start
  // again at page 1 (the page size and the sort stay as the user set them).
  function handleFiltersChange(next: Filters) {
    setFilters(next);
    setPagination((current) => ({ ...current, page: 1 }));
  }

  const error = employees.error
    ? employees.error instanceof ApiError
      ? employees.error.message
      : 'Something went wrong.'
    : null;

  const total = employees.data
    ? countFormat.format(employees.data.total)
    : null;

  return (
    <>
      <title>ACME · Employees</title>
      {/* Fills the space under the top bar, so the table scrolls inside its own frame and
          its header and pager stay in view. */}
      <Box
        sx={{
          height: '100%',
          minHeight: 420,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h1">Employees</Typography>
          <Typography
            color="text.secondary"
            sx={{ mt: 0.5, minHeight: '1.5em' }}
          >
            {total === null
              ? ''
              : hasActiveFilters(filters)
                ? `${total} matching`
                : `${total} people`}
          </Typography>
        </Box>
        <DirectoryFilters filters={filters} onChange={handleFiltersChange} />
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <EmployeeTable
            rows={employees.data?.items ?? []}
            total={employees.data?.total ?? 0}
            loading={employees.isFetching}
            pagination={pagination}
            sort={sort}
            onPaginationChange={setPagination}
            onSortChange={handleSortChange}
            error={error}
            onRetry={() => void employees.refetch()}
            onOpenEmployee={(id) => void navigate(paths.employee(id))}
          />
        </Box>
      </Box>
      {/* The open profile, if the address names one (see routes.tsx). */}
      <Outlet />
    </>
  );
}
