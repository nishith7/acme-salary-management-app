import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import {
  DataGrid,
  type GridPaginationModel,
  type GridSortModel,
} from '@mui/x-data-grid';
import { useMemo } from 'react';
import {
  isSortField,
  type EmployeeListItem,
  type SortField,
  type SortOrder,
} from '../../../api/employees.ts';
import { employeeColumns } from '../columns.tsx';

/** 25, 50 or 100: the free DataGrid shows at most 100 rows a page, the API's own limit. */
const PAGE_SIZES = [25, 50, 100];

/** `page` starts at 1, as in the API (the DataGrid itself counts from 0). */
export interface TablePagination {
  page: number;
  pageSize: number;
}

export interface TableSort {
  sortBy: SortField;
  sortOrder: SortOrder;
}

interface EmployeeTableProps {
  /** The current page of employees, as the API returned it. Never the whole directory. */
  rows: EmployeeListItem[];
  /** Employees matching the filters across all pages. */
  total: number;
  /** True while a page is being fetched. Shows a progress bar over the rows, or a skeleton if there are none yet. */
  loading: boolean;
  pagination: TablePagination;
  sort: TableSort;
  onPaginationChange: (next: TablePagination) => void;
  onSortChange: (next: TableSort) => void;
  /** A message to show instead of the table when the page could not be loaded. */
  error?: string | null;
  onRetry?: () => void;
  /** Called with the employee's id when a row is clicked. */
  onOpenEmployee?: (id: string) => void;
}

function NoEmployees() {
  return (
    <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 3 }}>
      <Typography color="text.secondary">No employees found.</Typography>
    </Box>
  );
}

/**
 * The employee directory table. It only displays what it is given: the API pages, sorts and
 * filters, and this reports what the user asked for. The DataGrid runs in server mode, so it
 * never sorts or counts rows itself, and with only one page of rows in memory a directory
 * of 10,000 people costs the same as one of 100.
 */
export function EmployeeTable({
  rows,
  total,
  loading,
  pagination,
  sort,
  onPaginationChange,
  onSortChange,
  error,
  onRetry,
  onOpenEmployee,
}: EmployeeTableProps) {
  // The same objects between renders unless the values change. With a fresh object on every
  // render the table jumped back to page 1 after each page change (reproduced by the
  // "stays on the page that was asked for" test, and seen in the browser).
  const paginationModel = useMemo(
    () => ({ page: pagination.page - 1, pageSize: pagination.pageSize }),
    [pagination.page, pagination.pageSize],
  );
  const sortModel = useMemo<GridSortModel>(
    () => [{ field: sort.sortBy, sort: sort.sortOrder }],
    [sort.sortBy, sort.sortOrder],
  );

  if (error) {
    return (
      <Alert
        severity="error"
        action={
          onRetry && (
            <Button color="inherit" size="small" onClick={onRetry}>
              Try again
            </Button>
          )
        }
      >
        Could not load employees. {error}
      </Alert>
    );
  }

  function handlePaginationModelChange(model: GridPaginationModel) {
    // A new page size makes the old page number meaningless, so start again from the top.
    const page = model.pageSize === pagination.pageSize ? model.page + 1 : 1;
    onPaginationChange({ page, pageSize: model.pageSize });
  }

  function handleSortModelChange(model: GridSortModel) {
    const [first] = model;
    if (first?.sort && isSortField(first.field)) {
      onSortChange({ sortBy: first.field, sortOrder: first.sort });
    }
  }

  return (
    <DataGrid
      aria-label="Employees"
      rows={rows}
      columns={employeeColumns}
      rowCount={total}
      loading={loading}
      paginationMode="server"
      sortingMode="server"
      paginationModel={paginationModel}
      onPaginationModelChange={handlePaginationModelChange}
      pageSizeOptions={PAGE_SIZES}
      sortModel={sortModel}
      onSortModelChange={handleSortModelChange}
      // The API sorts one column at a time and always has a sort, so a header toggles
      // between the two directions and there is no "unsorted" state to land on.
      sortingOrder={['asc', 'desc']}
      // The column menu only offers filtering and hiding columns; filters are the page's.
      disableColumnMenu
      disableRowSelectionOnClick
      onRowClick={({ id }, event) => {
        // The name is a real link (so it can be reached with the keyboard and opened in a new
        // tab); it navigates by itself, and the row must not navigate a second time.
        if ((event.target as HTMLElement).closest('a')) {
          return;
        }
        onOpenEmployee?.(String(id));
      }}
      rowHeight={56}
      columnHeaderHeight={44}
      getRowClassName={({ row }) =>
        row.status === 'TERMINATED' ? 'is-terminated' : ''
      }
      slots={{ noRowsOverlay: NoEmployees }}
      sx={{
        '& .is-terminated .MuiDataGrid-cell': { color: 'text.secondary' },
        '& .MuiDataGrid-row': {
          cursor: onOpenEmployee ? 'pointer' : 'default',
        },
      }}
    />
  );
}
