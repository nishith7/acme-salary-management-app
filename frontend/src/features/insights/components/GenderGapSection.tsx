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
import Typography from '@mui/material/Typography';
import { ApiError } from '../../../api/index.ts';
import { formatUsd } from '../../directory/format.ts';
import { describeGap } from '../format-gap.ts';
import { type PayChoices } from '../pay-query.ts';
import { useGenderGap } from '../use-gender-gap.ts';

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;

/**
 * The median pay of women against men at each level, in US dollars a year, and the gap between
 * them. It uses the page's country and department choices, so the comparison can be made
 * within one country. A level appears only where women and men each number at least 5.
 */
export function GenderGapSection({ choices }: { choices: PayChoices }) {
  const gap = useGenderGap(choices);
  const data = gap.data;

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      {gap.isFetching && <LinearProgress color="secondary" />}
      <Box sx={{ p: 2.5, pb: 1.5 }}>
        <Typography variant="h3" component="h2">
          Gender pay gap by level
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          The median pay of women compared with men at the same level. It is the
          women&apos;s median set against the men&apos;s, so &quot;8.3%
          lower&quot; means the typical woman is paid 8.3% less than the typical
          man at that level.
        </Typography>
        {choices.countries.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This compares everyone across every country. Pay differs a lot
            between countries, so choose one country above to compare like with
            like.
          </Typography>
        )}
      </Box>

      {gap.isError ? (
        <Box sx={{ p: 2.5, pt: 0 }}>
          <Alert
            severity="error"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => void gap.refetch()}
              >
                Try again
              </Button>
            }
          >
            Could not load the gender pay gap.{' '}
            {gap.error instanceof ApiError ? gap.error.message : ''}
          </Alert>
        </Box>
      ) : !data ? (
        <Box sx={{ p: 2.5, pt: 0 }} aria-busy aria-label="Loading the gap">
          <Skeleton variant="rounded" height={160} />
        </Box>
      ) : (
        <>
          {data.overall ? (
            <Typography sx={{ px: 2.5, pb: 1.5, fontWeight: 700 }}>
              Overall: {describeGap(data.overall.gapPercent)} (
              {formatUsd(data.overall.women.medianUsd)} for{' '}
              {plural(data.overall.women.headcount, 'woman', 'women')},{' '}
              {formatUsd(data.overall.men.medianUsd)} for{' '}
              {plural(data.overall.men.headcount, 'man', 'men')}).
            </Typography>
          ) : (
            <Typography color="text.secondary" sx={{ px: 2.5, pb: 1.5 }}>
              Fewer than {data.minimumGroupSize} women or fewer than{' '}
              {data.minimumGroupSize} men match these filters, so no comparison
              is shown. That keeps anyone from being picked out from a median.
            </Typography>
          )}
          {data.levels.length > 0 && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label="Gender pay gap by level">
                <TableHead>
                  <TableRow>
                    <TableCell>Level</TableCell>
                    <TableCell align="right">Women</TableCell>
                    <TableCell align="right">Women&apos;s median</TableCell>
                    <TableCell align="right">Men</TableCell>
                    <TableCell align="right">Men&apos;s median</TableCell>
                    <TableCell align="right">Women&apos;s pay is</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.levels.map((level) => (
                    <TableRow key={level.level} hover>
                      <TableCell sx={{ fontWeight: 700 }}>
                        {level.label}
                      </TableCell>
                      <TableCell align="right">
                        {level.women.headcount.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell align="right">
                        {formatUsd(level.women.medianUsd)}
                      </TableCell>
                      <TableCell align="right">
                        {level.men.headcount.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell align="right">
                        {formatUsd(level.men.medianUsd)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {describeGap(level.gapPercent)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
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
            {data.hiddenLevels > 0 && (
              <Typography variant="body2" color="text.secondary">
                {plural(data.hiddenLevels, 'level', 'levels')} not shown: fewer
                than {data.minimumGroupSize} women or fewer than{' '}
                {data.minimumGroupSize} men there, so that no one can be picked
                out from a median.
              </Typography>
            )}
            {data.otherGender > 0 && (
              <Typography variant="body2" color="text.secondary">
                {plural(data.otherGender, 'employee', 'employees')} of another
                gender {data.otherGender === 1 ? 'is' : 'are'} not part of this
                comparison.
              </Typography>
            )}
          </Box>
        </>
      )}
    </Paper>
  );
}
