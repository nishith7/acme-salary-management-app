import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import type { EmployeeListItem } from '../../../api/employees.ts';
import { bandPositionLabel, formatDate } from '../format.ts';

// The pieces the table's cells are made of. columns.tsx decides which cell goes in which
// column; this file decides how each one looks.

/**
 * Centres a custom cell's content vertically. DataGrid centres its own plain-text cells, but
 * a cell with custom content is a plain block with the content at the top, so this fills the
 * cell's height (the row height) and centres inside it.
 */
export function CellFrame({
  children,
  justify = 'flex-start',
}: {
  children: ReactNode;
  justify?: 'flex-start' | 'flex-end';
}) {
  return (
    <Box
      sx={{
        height: '100%',
        width: '100%',
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: justify,
      }}
    >
      {children}
    </Box>
  );
}

interface TwoLineProps {
  primary: ReactNode;
  secondary?: ReactNode;
  strong?: boolean;
  align?: 'left' | 'right';
}

/**
 * A main value with a smaller muted line under it. The table's rows are two lines tall, so
 * facts that belong together (a name and its code, a date and the tenure it means) share a
 * cell instead of each taking a column, which keeps ten columns inside a laptop screen.
 */
export function TwoLine({
  primary,
  secondary,
  strong = false,
  align = 'left',
}: TwoLineProps) {
  return (
    <CellFrame justify={align === 'right' ? 'flex-end' : 'flex-start'}>
      <Box sx={{ minWidth: 0, textAlign: align }}>
        <Typography
          variant="body2"
          noWrap
          color="inherit"
          sx={{ fontWeight: strong ? 700 : 400, lineHeight: 1.35 }}
        >
          {primary}
        </Typography>
        {secondary !== undefined && (
          <Typography
            variant="caption"
            component="div"
            noWrap
            color="text.secondary"
            sx={{ lineHeight: 1.35 }}
          >
            {secondary}
          </Typography>
        )}
      </Box>
    </CellFrame>
  );
}

/** A dash for "nothing here", with the reason as a tooltip. */
export function Dash({
  title,
  justify,
}: {
  title: string;
  justify?: 'flex-start' | 'flex-end';
}) {
  return (
    <CellFrame justify={justify}>
      <Typography variant="body2" color="text.secondary" title={title}>
        —
      </Typography>
    </CellFrame>
  );
}

export function BandPositionCell({ row }: { row: EmployeeListItem }) {
  const position = row.bandPosition;
  if (position === null) {
    return (
      <Dash title="No salary, or no pay band for this country and level" />
    );
  }
  const label = bandPositionLabel(position);
  if (position === 'WITHIN') {
    // The expected case is plain text, so the exceptions are what the eye finds.
    return (
      <CellFrame>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </CellFrame>
    );
  }
  return (
    <CellFrame>
      <Chip
        size="small"
        variant="outlined"
        label={label}
        color={position === 'BELOW' ? 'warning' : 'info'}
      />
    </CellFrame>
  );
}

export function StatusCell({ row }: { row: EmployeeListItem }) {
  const active = row.status === 'ACTIVE';
  return (
    <CellFrame>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        {/* Decoration only: the word next to it says the same. */}
        <Box
          aria-hidden
          sx={{
            width: 8,
            height: 8,
            flexShrink: 0,
            borderRadius: '50%',
            bgcolor: active ? 'success.main' : 'text.disabled',
          }}
        />
        <TwoLine
          primary={active ? 'Active' : 'Left'}
          secondary={
            row.terminatedOn ? formatDate(row.terminatedOn) : undefined
          }
        />
      </Box>
    </CellFrame>
  );
}
