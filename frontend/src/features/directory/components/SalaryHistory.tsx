import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { SalaryHistoryEntry } from '../../../api/employees.ts';
import {
  formatChangePercent,
  formatDate,
  formatMoney,
  salaryChangeTitle,
} from '../format.ts';

/** The marker beside a step: filled for the salary in force, a ring for one still to come. */
function Marker({ state }: { state: SalaryHistoryEntry['state'] }) {
  const current = state === 'CURRENT';
  return (
    <Box
      role={current ? 'img' : undefined}
      aria-label={current ? 'Current salary' : undefined}
      aria-hidden={current ? undefined : true}
      sx={{
        width: 10,
        height: 10,
        mt: 0.75,
        flexShrink: 0,
        borderRadius: '50%',
        border: 2,
        // Red for the salary in force, a dark ring for one still to come, a quiet grey dot
        // for what was replaced (the light divider colour was almost invisible on white).
        borderColor: current
          ? 'primary.main'
          : state === 'PAST'
            ? 'grey.400'
            : 'text.secondary',
        bgcolor: current
          ? 'primary.main'
          : state === 'PAST'
            ? 'grey.400'
            : 'background.paper',
      }}
    />
  );
}

/**
 * Every salary the person has been on, newest first: what it was called, when it started,
 * what it replaced and who recorded it, and the change as a percentage. Amounts stay in
 * the currency they were paid in; the change is left out when the currency changed.
 */
export function SalaryHistory({ entries }: { entries: SalaryHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <Typography color="text.secondary">No salary recorded yet.</Typography>
    );
  }
  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {entries.map((entry) => (
        <Box
          component="li"
          key={entry.id}
          sx={{
            display: 'flex',
            gap: 1.5,
            py: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Marker state={entry.state} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {salaryChangeTitle(entry.reason)}
              </Typography>
              {entry.state === 'SCHEDULED' && (
                <Chip size="small" variant="outlined" label="Scheduled" />
              )}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {[
                formatDate(entry.effectiveFrom),
                entry.previous &&
                  `from ${formatMoney(entry.previous.annualAmount, entry.previous.currencyCode)}`,
                entry.changedBy && `by ${entry.changedBy}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              {formatMoney(entry.annualAmount, entry.currencyCode)}
            </Typography>
            {entry.changePercent !== null && (
              <Typography variant="caption" sx={{ fontWeight: 800 }}>
                {formatChangePercent(entry.changePercent)}
              </Typography>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
