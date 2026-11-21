import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useState, type ChangeEvent, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { ApiError } from '../../../api/index.ts';
import { paths } from '../../../app/paths.ts';
import {
  BackIcon,
  DownloadIcon,
  UploadIcon,
} from '../../../components/icons.tsx';
import { UpdatePreview } from '../components/UpdatePreview.tsx';
import {
  useDownloadSalaryTemplate,
  usePreviewSalaryUpdate,
} from '../use-salary-update.ts';

/** The server's limit for one file (20,000 rows is about 2.5 MB). */
const MAX_BYTES = 6_000_000;

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
 * Changing many salaries from a spreadsheet: download the template, fill in the changes,
 * upload the file, and see every row checked before anything is saved. This page only checks
 * (the API's preview saves nothing); saving comes next.
 */
export function SalaryUpdatesPage() {
  const preview = usePreviewSalaryUpdate();
  const template = useDownloadSalaryTemplate();
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // So that choosing the same file again (after fixing it) still counts as a change.
    event.target.value = '';
    if (!file) {
      return;
    }
    setFileName(file.name);
    setFileError(null);
    preview.reset();

    // People will try the Excel file they have open. Say what to do instead of failing.
    if (/\.(xlsx|xlsm|xlsb|xls)$/i.test(file.name)) {
      setFileError(
        'That is an Excel workbook. In Excel choose File > Save As > CSV (Comma delimited) and choose that CSV file here.',
      );
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileError(
        'That file is too large: one update takes at most 20,000 rows. Split it into smaller files.',
      );
      return;
    }
    preview.mutate(await file.text());
  }

  const report = preview.data;

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

        <Step number={1} title="Get the template">
          <Typography color="text.secondary" sx={{ mb: 1.5 }}>
            It lists everyone who can still be given a salary, with their
            current salary. For the people getting a change, fill in{' '}
            <strong>New annual salary</strong> (digits and a dot, for example
            52000.50), <strong>Effective from</strong> (YYYY-MM-DD, for example
            2026-12-01) and <strong>Reason</strong> (Promotion, Merit increase,
            Market adjustment or Correction). Leave everyone else empty.
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
            Tip: Excel can turn 2026-12-01 into another date format. Format the
            Effective from column as Text before you type the dates.
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
              {preview.error instanceof ApiError ? preview.error.message : ''}
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

        {report && report.fileProblems.length === 0 && (
          <Step number={3} title="Check what would happen">
            <UpdatePreview key={String(preview.submittedAt)} report={report} />
          </Step>
        )}
      </Box>
    </>
  );
}
