import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import type { EmployeeSummaryQuery } from '../../../api/employees.ts';
import { ApiError } from '../../../api/index.ts';
import { formatUsd, formatUsdCompact } from '../format.ts';
import { useEmployeeSummary } from '../use-employee-summary.ts';

// Where a figure is not shown, so the card says why instead of looking broken.
const NOT_SHOWN = '—';

const count = (n: number) => n.toLocaleString('en-US');

function Card({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h2" component="p" sx={{ mt: 0.5 }}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {caption}
      </Typography>
    </Paper>
  );
}

const gridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
  gap: 2,
} as const;

/**
 * The four figures above the employee table, for whoever the filters match: how many people,
 * and the total, median and average annual salary of the current ones, in US dollars. They
 * are about current employees only, so on the whole directory they equal the Pay insights
 * page. The money is not shown for fewer than 5 people (the API leaves it out), and each
 * card then says why.
 */
export function SummaryCards({ query }: { query: EmployeeSummaryQuery }) {
  const summary = useEmployeeSummary(query);
  const { data } = summary;

  if (summary.isError) {
    return (
      <Alert
        severity="error"
        action={
          <Button
            color="inherit"
            size="small"
            onClick={() => void summary.refetch()}
          >
            Try again
          </Button>
        }
      >
        Could not load the summary.{' '}
        {summary.error instanceof ApiError ? summary.error.message : ''}
      </Alert>
    );
  }

  if (!data) {
    return (
      <Box sx={gridSx} aria-busy aria-label="Loading the summary">
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} variant="rounded" height={112} />
        ))}
      </Box>
    );
  }

  // Why the money is missing: nobody current matches, or fewer than 5 do.
  const hidden =
    data.counted === 0
      ? 'No current employees match'
      : 'Shown for 5 or more current employees';
  const money = (
    value: string | null,
    format: (decimal: string) => string,
    caption: string,
  ) =>
    value === null
      ? { value: NOT_SHOWN, caption: hidden }
      : { value: format(value), caption };

  return (
    <Box
      component="section"
      aria-label="Summary of the employees shown"
      aria-busy={summary.isFetching}
      sx={{
        ...gridSx,
        opacity: summary.isPlaceholderData ? 0.6 : 1,
        transition: 'opacity 150ms',
      }}
    >
      <Card
        label="Employees"
        value={count(data.headcount)}
        caption={`${count(data.counted)} current with a salary`}
      />
      <Card
        label="Total annual salary"
        {...money(
          data.totalAnnualUsd,
          formatUsdCompact,
          'current employees, in US dollars',
        )}
      />
      <Card
        label="Median salary"
        {...money(data.medianUsd, formatUsd, 'half earn more, half less')}
      />
      <Card
        label="Average salary"
        {...money(data.averageUsd, formatUsd, 'the total shared equally')}
      />
    </Box>
  );
}
