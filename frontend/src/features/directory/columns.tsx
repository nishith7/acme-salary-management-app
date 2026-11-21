import Typography from '@mui/material/Typography';
import type { GridColDef } from '@mui/x-data-grid';
import type { EmployeeListItem } from '../../api/employees.ts';
import {
  BandPositionCell,
  CellFrame,
  Dash,
  StatusCell,
  TwoLine,
} from './components/cells.tsx';
import {
  formatAmount,
  formatDate,
  formatTenureBand,
  formatUsd,
} from './format.ts';

/**
 * The directory's columns. A column's `field` is the API's sort field wherever the API can
 * sort by it (checked by a test), so a header click maps straight to `sortBy`. Salary in the
 * person's own currency is not sortable: ordering amounts of different currencies means
 * nothing, so people sort by the USD column instead.
 */
export const employeeColumns: GridColDef<EmployeeListItem>[] = [
  {
    field: 'fullName',
    headerName: 'Employee',
    flex: 1.3,
    minWidth: 176,
    renderCell: ({ row }) => (
      <TwoLine strong primary={row.fullName} secondary={row.employeeCode} />
    ),
  },
  { field: 'jobTitle', headerName: 'Job title', flex: 1.2, minWidth: 150 },
  {
    field: 'level',
    headerName: 'Level',
    type: 'number',
    width: 68,
    headerAlign: 'right',
    align: 'right',
  },
  { field: 'department', headerName: 'Department', flex: 1, minWidth: 128 },
  {
    field: 'country',
    headerName: 'Country',
    flex: 0.9,
    minWidth: 124,
    valueGetter: (_value, row) => row.country.name,
  },
  {
    field: 'joiningDate',
    headerName: 'Joined',
    width: 116,
    renderCell: ({ row }) => (
      <TwoLine
        primary={formatDate(row.joiningDate)}
        secondary={formatTenureBand(row.tenureBand)}
      />
    ),
  },
  {
    field: 'currentSalary',
    headerName: 'Salary (local)',
    width: 136,
    sortable: false,
    align: 'right',
    headerAlign: 'right',
    renderCell: ({ row }) =>
      row.currentSalary ? (
        <TwoLine
          align="right"
          primary={formatAmount(row.currentSalary.annualAmount)}
          secondary={row.currentSalary.currencyCode}
        />
      ) : (
        <Dash justify="flex-end" title="No salary record" />
      ),
  },
  {
    field: 'salaryUsd',
    headerName: 'Salary (USD)',
    width: 152,
    align: 'right',
    headerAlign: 'right',
    valueGetter: (_value, row) => row.currentSalary?.annualAmountUsd ?? null,
    renderCell: ({ value }) =>
      typeof value === 'string' ? (
        <CellFrame justify="flex-end">
          <Typography variant="body2" color="inherit" sx={{ fontWeight: 700 }}>
            {formatUsd(value)}
          </Typography>
        </CellFrame>
      ) : (
        <Dash
          justify="flex-end"
          title="No salary, or no exchange rate for its currency"
        />
      ),
  },
  {
    field: 'bandPosition',
    headerName: 'Pay band',
    width: 116,
    sortable: false,
    renderCell: ({ row }) => <BandPositionCell row={row} />,
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 112,
    sortable: false,
    renderCell: ({ row }) => <StatusCell row={row} />,
  },
];
