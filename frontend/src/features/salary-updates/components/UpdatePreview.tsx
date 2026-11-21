import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useMemo, useState } from 'react';
import type {
  SalaryUpdateReport,
  SalaryUpdateRow,
} from '../../../api/salary-updates.ts';
import { DownloadIcon } from '../../../components/icons.tsx';
import { saveBlob } from '../../../lib/save-file.ts';
import { CellFrame, Dash, TwoLine } from '../../directory/components/cells.tsx';
import {
  formatChangePercent,
  formatDate,
  formatMoney,
  salaryChangeTitle,
} from '../../directory/format.ts';
import { errorReportCsv } from '../error-report.ts';

type View = 'attention' | 'update' | 'unchanged' | 'all';

const needsAttention = (row: SalaryUpdateRow) =>
  row.outcome === 'ERROR' || row.warnings.length > 0;

/** Start on what needs a decision: the problems, or, if there are none, what will change. */
function firstView(report: SalaryUpdateReport): View {
  return report.rows.some(needsAttention) ? 'attention' : 'update';
}

function Stat({
  value,
  label,
  color = 'text.primary',
}: {
  value: number;
  label: string;
  color?: string;
}) {
  return (
    <Box sx={{ minWidth: 120 }}>
      <Typography variant="h2" sx={{ color }}>
        {value.toLocaleString('en-US')}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

const columns: GridColDef<SalaryUpdateRow>[] = [
  {
    field: 'line',
    headerName: 'Line',
    type: 'number',
    width: 72,
    headerAlign: 'right',
    align: 'right',
    renderCell: ({ row }) => (
      <CellFrame justify="flex-end">
        <Typography variant="body2" color="inherit">
          {row.line}
        </Typography>
      </CellFrame>
    ),
  },
  {
    field: 'employeeCode',
    headerName: 'Employee',
    flex: 1,
    minWidth: 160,
    renderCell: ({ row }) => (
      <TwoLine
        strong
        primary={row.employeeCode || '—'}
        secondary={row.fullName ?? 'Not found'}
      />
    ),
  },
  {
    field: 'salary',
    headerName: 'Salary',
    flex: 1.1,
    minWidth: 200,
    sortable: false,
    renderCell: ({ row }) => {
      const change = row.change;
      if (!change) {
        return <Dash title="Nothing will be recorded for this row" />;
      }
      const now = formatMoney(change.annualAmount, change.currencyCode);
      return (
        <TwoLine
          primary={
            change.previousAmount
              ? `${formatMoney(change.previousAmount, change.currencyCode)} → ${now}`
              : now
          }
          secondary={
            change.changePercent
              ? formatChangePercent(change.changePercent)
              : 'First salary'
          }
        />
      );
    },
  },
  {
    field: 'effectiveFrom',
    headerName: 'Effective from',
    width: 132,
    sortable: false,
    renderCell: ({ row }) =>
      row.change ? (
        <TwoLine primary={formatDate(row.change.effectiveFrom)} />
      ) : (
        <Dash title="Nothing will be recorded for this row" />
      ),
  },
  {
    field: 'reason',
    headerName: 'Reason',
    width: 140,
    sortable: false,
    renderCell: ({ row }) =>
      row.change ? (
        <TwoLine primary={salaryChangeTitle(row.change.reason)} />
      ) : (
        <Dash title="Nothing will be recorded for this row" />
      ),
  },
  {
    field: 'outcome',
    headerName: 'Result',
    width: 150,
    renderCell: ({ row }) => (
      <Box
        sx={{ display: 'flex', gap: 0.5, alignItems: 'center', height: '100%' }}
      >
        {row.outcome === 'WILL_UPDATE' && (
          <Chip
            size="small"
            variant="outlined"
            color="success"
            label="Will update"
          />
        )}
        {row.outcome === 'UNCHANGED' && (
          <Chip size="small" variant="outlined" label="Unchanged" />
        )}
        {row.outcome === 'ERROR' && (
          <Chip size="small" variant="outlined" color="error" label="Error" />
        )}
        {row.warnings.length > 0 && (
          <Chip size="small" variant="outlined" color="warning" label="Check" />
        )}
      </Box>
    ),
  },
  {
    field: 'notes',
    headerName: 'Notes',
    flex: 2,
    minWidth: 260,
    sortable: false,
    renderCell: ({ row }) => (
      <Box sx={{ py: 1, whiteSpace: 'normal', lineHeight: 1.4 }}>
        {row.errors.map((message) => (
          <Typography key={message} variant="body2" color="error">
            {message}
          </Typography>
        ))}
        {row.warnings.map((message) => (
          <Typography
            key={message}
            variant="body2"
            sx={{ color: 'warning.main' }}
          >
            {message}
          </Typography>
        ))}
        {row.outcome === 'UNCHANGED' && (
          <Typography variant="body2" color="text.secondary">
            Already this salary: nothing to change.
          </Typography>
        )}
      </Box>
    ),
  },
];

/**
 * What a file would do, before anything is saved: the counts, then every row with its result
 * and what is wrong with it. It opens on the rows that need a decision (errors and warnings),
 * since the rest is "fine". Mount a new one (with a new `key`) for each file checked.
 */
export function UpdatePreview({ report }: { report: SalaryUpdateReport }) {
  const [view, setView] = useState<View>(() => firstView(report));
  const { summary } = report;

  const shown = useMemo(() => {
    switch (view) {
      case 'attention':
        return report.rows.filter(needsAttention);
      case 'update':
        return report.rows.filter((r) => r.outcome === 'WILL_UPDATE');
      case 'unchanged':
        return report.rows.filter((r) => r.outcome === 'UNCHANGED');
      default:
        return report.rows;
    }
  }, [report.rows, view]);

  const errorRows = report.rows.filter((r) => r.outcome === 'ERROR');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <Stat
          value={summary.willUpdate}
          label="will be updated"
          color="success.main"
        />
        <Stat value={summary.unchanged} label="already at that salary" />
        <Stat
          value={summary.errors}
          label="with errors, to fix"
          color={summary.errors > 0 ? 'error.main' : 'text.primary'}
        />
        <Stat
          value={summary.withWarnings}
          label="to double-check"
          color={summary.withWarnings > 0 ? 'warning.main' : 'text.primary'}
        />
        <Stat value={summary.notRequested} label="left empty (ignored)" />
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.5,
          alignItems: 'center',
        }}
      >
        <ToggleButtonGroup
          exclusive
          size="small"
          color="secondary"
          aria-label="Which rows to show"
          value={view}
          onChange={(_event, next: View | null) => {
            if (next !== null) {
              setView(next);
            }
          }}
        >
          <ToggleButton
            value="attention"
            sx={{ textTransform: 'none', px: 1.75 }}
          >
            Needs attention
          </ToggleButton>
          <ToggleButton value="update" sx={{ textTransform: 'none', px: 1.75 }}>
            Will update
          </ToggleButton>
          <ToggleButton
            value="unchanged"
            sx={{ textTransform: 'none', px: 1.75 }}
          >
            Unchanged
          </ToggleButton>
          <ToggleButton value="all" sx={{ textTransform: 'none', px: 1.75 }}>
            All
          </ToggleButton>
        </ToggleButtonGroup>
        {errorRows.length > 0 && (
          <Button
            color="secondary"
            startIcon={<DownloadIcon />}
            onClick={() =>
              saveBlob(
                new Blob([errorReportCsv(errorRows)], { type: 'text/csv' }),
                'salary-update-errors.csv',
              )
            }
          >
            Download error report
          </Button>
        )}
      </Box>

      <DataGrid
        aria-label="Rows of the file"
        rows={shown}
        columns={columns}
        getRowId={(row) => row.line}
        getRowHeight={() => 'auto'}
        disableColumnMenu
        disableRowSelectionOnClick
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        slots={{
          noRowsOverlay: () => (
            <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
              <Typography color="text.secondary">
                No rows in this view.
              </Typography>
            </Box>
          ),
        }}
        sx={{ '& .MuiDataGrid-cell': { alignItems: 'center', py: 1 } }}
      />
    </Box>
  );
}
