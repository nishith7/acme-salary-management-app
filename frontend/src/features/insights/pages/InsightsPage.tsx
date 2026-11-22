import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { ApiError } from '../../../api/index.ts';
import type { PayGrouping, PayInsights } from '../../../api/insights.ts';
import { paths } from '../../../app/paths.ts';
import { BackIcon } from '../../../components/icons.tsx';
import { MultiSelectFilter } from '../../directory/components/MultiSelectFilter.tsx';
import { GenderGapSection } from '../components/GenderGapSection.tsx';
import {
  formatDate,
  formatUsd,
  formatUsdCompact,
} from '../../directory/format.ts';
import { useFilterOptions } from '../../directory/use-filter-options.ts';
import {
  hasPayFilters,
  NO_PAY_FILTERS,
  type PayChoices,
} from '../pay-query.ts';
import { usePayInsights } from '../use-pay-insights.ts';

const GROUPING_TITLES: Record<PayGrouping, string> = {
  country: 'Country',
  department: 'Department',
  level: 'Level',
};

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 150 }}>
      <Typography variant="h2">{value}</Typography>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

/**
 * The medians of the groups shown, as a bar each, so the eye sees the gaps before reading the
 * numbers. The bar only needs a ratio, so this is the one place a salary becomes a number, and
 * only to draw a width: nothing is calculated from it and nothing is shown that came from it.
 */
function PayTable({ insights }: { insights: PayInsights }) {
  const widest = useMemo(
    () => Math.max(...insights.groups.map((g) => Number(g.medianUsd)), 1),
    [insights.groups],
  );
  const title = GROUPING_TITLES[insights.groupBy];

  return (
    <Table size="small" aria-label={`Pay by ${insights.groupBy}`}>
      <TableHead>
        <TableRow>
          <TableCell>{title}</TableCell>
          <TableCell align="right">People</TableCell>
          <TableCell align="right">25th percentile</TableCell>
          <TableCell sx={{ minWidth: 200 }}>Median</TableCell>
          <TableCell align="right">75th percentile</TableCell>
          <TableCell align="right">Cost a year</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {insights.groups.map((group) => (
          <TableRow key={group.key} hover>
            <TableCell sx={{ fontWeight: 700 }}>{group.label}</TableCell>
            <TableCell align="right">
              {group.headcount.toLocaleString('en-US')}
            </TableCell>
            <TableCell align="right">{formatUsd(group.p25Usd)}</TableCell>
            <TableCell>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {formatUsd(group.medianUsd)}
              </Typography>
              <Box
                aria-hidden
                sx={{
                  mt: 0.5,
                  height: 4,
                  borderRadius: 2,
                  bgcolor: 'primary.main',
                  width: `${(Number(group.medianUsd) / widest) * 100}%`,
                }}
              />
            </TableCell>
            <TableCell align="right">{formatUsd(group.p75Usd)}</TableCell>
            <TableCell align="right">
              {formatUsdCompact(group.totalAnnualUsd)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * How current employees are paid: the median and the middle half (25th to 75th percentile) of
 * every country, department or level, in US dollars a year, with what they cost together.
 * The figures come from the API, which hides any group of fewer than 5 people.
 */
export function InsightsPage() {
  const [choices, setChoices] = useState<PayChoices>({
    groupBy: 'country',
    ...NO_PAY_FILTERS,
  });
  const insights = usePayInsights(choices);
  const options = useFilterOptions();
  const data = insights.data;

  const countryOptions = useMemo(
    () =>
      (options.data?.countries ?? []).map((c) => ({
        value: c.code,
        label: c.name,
      })),
    [options.data],
  );
  const departmentOptions = useMemo(
    () =>
      (options.data?.departments ?? []).map((name) => ({
        value: name,
        label: name,
      })),
    [options.data],
  );

  return (
    <>
      <title>ACME · Pay insights</title>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2.5,
          maxWidth: 1180,
        }}
      >
        <Box>
          <Button
            component={RouterLink}
            to={paths.employees}
            color="secondary"
            startIcon={<BackIcon />}
            sx={{ ml: -1, mb: 1 }}
          >
            Employees
          </Button>
          <Typography variant="h1">Pay insights</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            How current employees are paid, in US dollars a year.
          </Typography>
        </Box>

        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <ToggleButtonGroup
              exclusive
              size="small"
              color="secondary"
              aria-label="Compare by"
              value={choices.groupBy}
              onChange={(_event, next: PayGrouping | null) => {
                if (next !== null) {
                  setChoices({ ...choices, groupBy: next });
                }
              }}
            >
              {(Object.keys(GROUPING_TITLES) as PayGrouping[]).map((key) => (
                <ToggleButton
                  key={key}
                  value={key}
                  sx={{ height: 40, px: 2, textTransform: 'none' }}
                >
                  By {GROUPING_TITLES[key].toLowerCase()}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <MultiSelectFilter
              label="Country"
              allLabel="All countries"
              plural="countries"
              options={countryOptions}
              selected={choices.countries}
              onChange={(countries) => setChoices({ ...choices, countries })}
              disabled={!options.data}
            />
            <MultiSelectFilter
              label="Department"
              allLabel="All departments"
              plural="departments"
              options={departmentOptions}
              selected={choices.departments}
              onChange={(departments) =>
                setChoices({ ...choices, departments })
              }
              disabled={!options.data}
            />
            {hasPayFilters(choices) && (
              <Button
                color="secondary"
                onClick={() => setChoices({ ...choices, ...NO_PAY_FILTERS })}
              >
                Clear filters
              </Button>
            )}
          </Box>
        </Paper>

        {insights.isError ? (
          <Alert
            severity="error"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => void insights.refetch()}
              >
                Try again
              </Button>
            }
          >
            Could not load the pay figures.{' '}
            {insights.error instanceof ApiError ? insights.error.message : ''}
          </Alert>
        ) : !data ? (
          <Box aria-busy aria-label="Loading pay figures">
            <Skeleton variant="rounded" height={90} />
            <Skeleton variant="rounded" height={260} sx={{ mt: 2 }} />
          </Box>
        ) : (
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            {insights.isFetching && <LinearProgress color="secondary" />}
            {data.overall ? (
              <>
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 4,
                    p: 2.5,
                    borderBottom: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Stat
                    label="people"
                    value={data.overall.headcount.toLocaleString('en-US')}
                  />
                  <Stat
                    label="median salary"
                    value={formatUsd(data.overall.medianUsd)}
                  />
                  <Stat
                    label="middle half earn"
                    value={`${formatUsdCompact(data.overall.p25Usd)} to ${formatUsdCompact(data.overall.p75Usd)}`}
                  />
                  <Stat
                    label="annual salary cost"
                    value={formatUsdCompact(data.overall.totalAnnualUsd)}
                  />
                </Box>
                {data.groups.length > 0 ? (
                  <Box sx={{ overflowX: 'auto' }}>
                    <PayTable insights={data} />
                  </Box>
                ) : (
                  <Typography color="text.secondary" sx={{ p: 2.5 }}>
                    Every group here has fewer than {data.minimumGroupSize}{' '}
                    people, so none is shown.
                  </Typography>
                )}
              </>
            ) : (
              <Typography color="text.secondary" sx={{ p: 2.5 }}>
                Fewer than {data.minimumGroupSize} people match these filters,
                so no figures are shown. That keeps anyone from being picked out
                from a number.
              </Typography>
            )}
            <Box
              sx={{
                p: 2.5,
                pt: 1.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
              }}
            >
              {data.hiddenGroups > 0 && (
                <Typography variant="body2" color="text.secondary">
                  {plural(data.hiddenGroups, 'group', 'groups')} with fewer than{' '}
                  {data.minimumGroupSize} people{' '}
                  {data.hiddenGroups === 1 ? 'is' : 'are'} not shown, so that no
                  one can be picked out from a figure.
                </Typography>
              )}
              {data.excluded > 0 && (
                <Typography variant="body2" color="text.secondary">
                  {plural(
                    data.excluded,
                    'current employee',
                    'current employees',
                  )}{' '}
                  {data.excluded === 1 ? 'has' : 'have'} no salary or no
                  exchange rate, so {data.excluded === 1 ? 'is' : 'are'} not
                  counted.
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                Salaries as they were on {formatDate(data.asOf)}, converted at
                that day&apos;s exchange rates.
              </Typography>
            </Box>
          </Paper>
        )}

        <GenderGapSection choices={choices} />
      </Box>
    </>
  );
}
