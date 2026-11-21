import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useState, type ChangeEvent, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { ApiError } from '../../../api/index.ts';
import type { SalaryUpdateReport } from '../../../api/salary-updates.ts';
import { paths } from '../../../app/paths.ts';
import {
  BackIcon,
  DownloadIcon,
  UploadIcon,
} from '../../../components/icons.tsx';
import { UpdatePreview } from '../components/UpdatePreview.tsx';
import {
  useApplySalaryUpdate,
  useDownloadSalaryTemplate,
  usePreviewSalaryUpdate,
} from '../use-salary-update.ts';

/** The server's limit for one file (20,000 rows is about 2.5 MB). */
const MAX_BYTES = 6_000_000;

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography variant="h3" component="h2">
        {number}. {title}
      </Typography>
      <Box sx={{ mt: 1 }}>{children}</Box>
    </Paper>
  );
}

/**
 * Step 4: the decision. When some rows will be skipped (errors) or deserve a second look
 * (warnings), the person confirms they have seen them before the button works; when
 * everything is clean it is just the button. Applying uses the same file again, and the
 * server checks it again, so what is added is what is true now.
 */
function ApplyStep({
  report,
  onApply,
  pending,
  error,
}: {
  report: SalaryUpdateReport;
  onApply: () => void;
  pending: boolean;
  error: string | null;
}) {
  const { willUpdate, errors, withWarnings } = report.summary;
  const [confirmed, setConfirmed] = useState(false);
  const needsConfirmation = errors > 0 || withWarnings > 0;

  if (willUpdate === 0) {
    return (
      <Alert severity="info">
        Nothing to apply: no row would change a salary. Fix the rows with errors
        and choose the file again.
      </Alert>
    );
  }

  const concerns = [
    errors > 0
      ? `${plural(errors, 'row', 'rows')} with errors will be skipped`
      : null,
    withWarnings > 0
      ? `${plural(withWarnings, 'row', 'rows')} marked Check will be applied`
      : null,
  ].filter(Boolean);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography color="text.secondary">
        This adds {plural(willUpdate, 'salary change', 'salary changes')} to the
        history, as you, all at once. Nothing is edited or deleted, so a mistake
        is put right with a later change.
      </Typography>
      {needsConfirmation && (
        <FormControlLabel
          control={
            <Checkbox
              color="secondary"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
          }
          label={`I have looked at the rows that need attention: ${concerns.join(', ')}.`}
        />
      )}
      {error && <Alert severity="error">{error}</Alert>}
      <Box>
        <Button
          variant="contained"
          disabled={needsConfirmation && !confirmed}
          loading={pending}
          onClick={onApply}
        >
          {`Apply ${plural(willUpdate, 'salary change', 'salary changes')}`}
        </Button>
      </Box>
    </Box>
  );
}

/**
 * Changing many salaries from a spreadsheet: download the template, fill in the changes,
 * choose the file, see every row checked, then apply. The check saves nothing; applying adds
 * the salaries of the rows that passed, all under one import.
 */
export function SalaryUpdatesPage() {
  const preview = usePreviewSalaryUpdate();
  const apply = useApplySalaryUpdate();
  const template = useDownloadSalaryTemplate();
  // The file as chosen: applying sends the same text again.
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  function startOver() {
    preview.reset();
    apply.reset();
    setFile(null);
    setFileName(null);
    setFileError(null);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    // So that choosing the same file again (after fixing it) still counts as a change.
    event.target.value = '';
    if (!chosen) {
      return;
    }
    preview.reset();
    apply.reset();
    setFile(null);
    setFileName(chosen.name);
    setFileError(null);

    // People will try the Excel file they have open. Say what to do instead of failing.
    if (/\.(xlsx|xlsm|xlsb|xls)$/i.test(chosen.name)) {
      setFileError(
        'That is an Excel workbook. In Excel choose File > Save As > CSV (Comma delimited) and choose that CSV file here.',
      );
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setFileError(
        'That file is too large: one update takes at most 20,000 rows. Split it into smaller files.',
      );
      return;
    }
    const text = await chosen.text();
    setFile({ name: chosen.name, text });
    preview.mutate(text);
  }

  const report = preview.data;
  const result = apply.data;
  const applyError = apply.isError
    ? apply.error instanceof ApiError
      ? apply.error.message
      : 'Could not apply the update. Check your connection and try again.'
    : null;

  return (
    <>
      <title>ACME · Bulk salary update</title>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2.5,
          maxWidth: 1320,
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
          <Typography variant="h1">Bulk salary update</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Change many salaries from one spreadsheet. Every row is checked
            before anything is saved.
          </Typography>
        </Box>

        {result ? (
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            {result.applied > 0 ? (
              <Alert severity="success">
                <Typography sx={{ fontWeight: 700 }}>
                  {plural(result.applied, 'salary change', 'salary changes')}{' '}
                  added.
                </Typography>
                {plural(result.unchanged, 'row was', 'rows were')} already at
                that salary and {plural(result.skipped, 'row was', 'rows were')}{' '}
                skipped because of errors.
              </Alert>
            ) : (
              <Alert severity="info">
                <Typography sx={{ fontWeight: 700 }}>
                  Nothing was added.
                </Typography>
                Every row was already at its salary or had an error, so nothing
                was saved.
              </Alert>
            )}
            <Box sx={{ display: 'flex', gap: 1.5, mt: 2 }}>
              <Button
                component={RouterLink}
                to={paths.employees}
                variant="contained"
              >
                Back to employees
              </Button>
              <Button variant="outlined" color="secondary" onClick={startOver}>
                Start another update
              </Button>
            </Box>
          </Paper>
        ) : (
          <>
            <Step number={1} title="Get the template">
              <Typography color="text.secondary" sx={{ mb: 1.5 }}>
                It lists everyone who can still be given a salary, with their
                current salary. For the people getting a change, fill in{' '}
                <strong>New annual salary</strong> (digits and a dot, for
                example 52000.50), <strong>Effective from</strong> (YYYY-MM-DD,
                for example 2026-12-01) and <strong>Reason</strong> (Promotion,
                Merit increase, Market adjustment or Correction). Leave everyone
                else empty.
              </Typography>
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<DownloadIcon />}
                loading={template.isPending}
                onClick={() => template.mutate()}
              >
                Download template
              </Button>
              {template.isError && (
                <Alert severity="error" sx={{ mt: 1.5 }}>
                  Could not download the template. Check your connection and try
                  again.
                </Alert>
              )}
              <Typography
                variant="caption"
                color="text.secondary"
                component="p"
                sx={{ mt: 1.5 }}
              >
                Tip: Excel can turn 2026-12-01 into another date format. Format
                the Effective from column as Text before you type the dates.
              </Typography>
            </Step>

            <Step number={2} title="Choose your file">
              <Typography color="text.secondary" sx={{ mb: 1.5 }}>
                Save the spreadsheet as CSV and choose it here. Nothing is saved
                yet: you will see what would happen.
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  flexWrap: 'wrap',
                }}
              >
                <Button
                  component="label"
                  variant="contained"
                  startIcon={<UploadIcon />}
                  loading={preview.isPending}
                  disabled={apply.isPending}
                >
                  Choose CSV file
                  <input
                    type="file"
                    accept=".csv,text/csv,.txt"
                    hidden
                    onChange={(event) => void handleFile(event)}
                  />
                </Button>
                {fileName && (
                  <Typography sx={{ fontWeight: 700 }}>{fileName}</Typography>
                )}
              </Box>
              {fileError && (
                <Alert severity="error" sx={{ mt: 1.5 }}>
                  {fileError}
                </Alert>
              )}
              {preview.isError && (
                <Alert severity="error" sx={{ mt: 1.5 }}>
                  Could not check the file.{' '}
                  {preview.error instanceof ApiError
                    ? preview.error.message
                    : ''}
                </Alert>
              )}
              {report && report.fileProblems.length > 0 && (
                <Alert severity="error" sx={{ mt: 1.5 }}>
                  <Typography sx={{ fontWeight: 700 }}>
                    This file cannot be used:
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                    {report.fileProblems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </Box>
                </Alert>
              )}
            </Step>

            {report && file && report.fileProblems.length === 0 && (
              <>
                <Step number={3} title="Check what would happen">
                  <UpdatePreview
                    key={String(preview.submittedAt)}
                    report={report}
                  />
                </Step>
                <Step number={4} title="Apply">
                  <ApplyStep
                    key={String(preview.submittedAt)}
                    report={report}
                    pending={apply.isPending}
                    error={applyError}
                    onApply={() =>
                      apply.mutate({ csv: file.text, fileName: file.name })
                    }
                  />
                </Step>
              </>
            )}
          </>
        )}
      </Box>
    </>
  );
}
