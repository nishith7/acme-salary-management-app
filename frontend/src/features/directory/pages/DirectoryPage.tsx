import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, Outlet, useNavigate } from 'react-router';
import { ApiError } from '../../../api/index.ts';
import { paths } from '../../../app/paths.ts';
import {
  DownloadIcon,
  InsightsIcon,
  UploadIcon,
} from '../../../components/icons.tsx';
import { DirectoryFilters } from '../components/DirectoryFilters.tsx';
import {
  EmployeeTable,
  type TablePagination,
  type TableSort,
} from '../components/EmployeeTable.tsx';
import { SummaryCards } from '../components/SummaryCards.tsx';
import {
  NO_FILTERS,
  hasActiveFilters,
  toEmployeeFilterQuery,
  type DirectoryFilters as Filters,
} from '../filters.ts';
import { useEmployees } from '../use-employees.ts';
import { useExportEmployees } from '../use-export-employees.ts';

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
  // What the filters ask for, shared by the table and the cards above it.
  const filterQuery = toEmployeeFilterQuery(filters);
  const employees = useEmployees({
    ...filterQuery,
    ...pagination,
    ...sort,
  });

  const exporting = useExportEmployees();
  // The file is the screen, minus the paging: the same filters and the same sort, everyone.
  const exportCurrentView = () =>
    exporting.mutate({ ...toEmployeeFilterQuery(filters), ...sort });

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
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
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
          <Button
            component={RouterLink}
            to={paths.insights}
            variant="outlined"
            color="secondary"
            startIcon={<InsightsIcon />}
          >
            Pay insights
          </Button>
          <Button
            component={RouterLink}
            to={paths.salaryUpdates}
            variant="outlined"
            color="secondary"
            startIcon={<UploadIcon />}
          >
            Bulk update
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<DownloadIcon />}
            loading={exporting.isPending}
            onClick={exportCurrentView}
          >
            Export CSV
          </Button>
        </Box>
        <SummaryCards query={filterQuery} />
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
      <Snackbar
        open={exporting.isError}
        autoHideDuration={8000}
        onClose={() => exporting.reset()}
      >
        <Alert
          severity="error"
          variant="filled"
          onClose={() => exporting.reset()}
        >
          Could not export the employees. Check your connection and try again.
        </Alert>
      </Snackbar>
    </>
  );
}
