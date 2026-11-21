import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import type { EmployeeProfile } from '../../../api/employees.ts';
import { ApiError } from '../../../api/index.ts';
import { paths } from '../../../app/paths.ts';
import { CloseIcon, EditIcon } from '../../../components/icons.tsx';
import { SalaryChangeDialog } from '../components/SalaryChangeDialog.tsx';
import { SalaryHistory } from '../components/SalaryHistory.tsx';
import { formatDate, formatMoney, formatUsd } from '../format.ts';
import { useEmployee } from '../use-employee.ts';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" component="dt">
        {label}
      </Typography>
      <Typography component="dd" sx={{ fontWeight: 700 }}>
        {children}
      </Typography>
    </Box>
  );
}

function Details({ employee }: { employee: EmployeeProfile }) {
  const salary = employee.currentSalary;
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 2.5,
        '& dt, & dd': { m: 0 },
        '& dt': { display: 'block' },
      }}
    >
      <Field label="Job title">{employee.jobTitle}</Field>
      <Field label="Department">{employee.department}</Field>
      <Field label="Country">{employee.country.name}</Field>
      <Field label="Status">
        {employee.status === 'ACTIVE'
          ? 'Active'
          : `Left${employee.terminatedOn ? ` on ${formatDate(employee.terminatedOn)}` : ''}`}
      </Field>
      <Field label="Level">{employee.level}</Field>
      <Field label="Joined">{formatDate(employee.joiningDate)}</Field>
      <Field label="Annual salary">
        {salary ? formatMoney(salary.annualAmount, salary.currencyCode) : '—'}
      </Field>
      <Field label="In USD">
        {salary?.annualAmountUsd ? formatUsd(salary.annualAmountUsd) : '—'}
      </Field>
    </Box>
  );
}

function Loading() {
  return (
    <Box aria-busy aria-label="Loading employee">
      <Skeleton width="55%" height={28} />
      <Skeleton width="30%" />
      <Skeleton variant="rounded" height={140} sx={{ mt: 3 }} />
      <Skeleton variant="rounded" height={180} sx={{ mt: 3 }} />
    </Box>
  );
}

/**
 * One employee's profile, in a panel that slides in over the directory. It is a route
 * (`/employees/:id`, nested inside the directory) so a profile has its own link and the Back
 * button closes it, while the list behind it stays as it was, filters and page included.
 */
export function EmployeeProfilePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const employee = useEmployee(id);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  // Opened from the directory: closing steps back, so the Back button does not bring the
  // profile back. Opened from a link or a reload (nothing earlier in this app): go to the
  // directory, replacing the profile in the history.
  const location = useLocation();
  const openedFromDirectory = location.key !== 'default';
  const close = () =>
    void (openedFromDirectory
      ? navigate(-1)
      : navigate(paths.employees, { replace: true }));

  const notFound =
    employee.error instanceof ApiError && employee.error.status === 404;
  // The title says what the panel is about even while the person has not loaded yet.
  const title = employee.data?.fullName ?? 'Employee';

  return (
    <>
      <Drawer
        anchor="right"
        open
        onClose={close}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-modal': true,
            'aria-labelledby': 'employee-profile-title',
            sx: { width: { xs: '100%', sm: 480 }, display: 'flex' },
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, p: 3 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h2" id="employee-profile-title">
              {title}
            </Typography>
            {employee.data && (
              <Typography color="text.secondary">
                {employee.data.employeeCode}
              </Typography>
            )}
          </Box>
          <IconButton aria-label="Close" edge="end" onClick={close}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider />

        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 3 }}>
          {employee.isPending ? (
            <Loading />
          ) : notFound ? (
            <Alert severity="warning">
              This employee does not exist. They may have been removed.
            </Alert>
          ) : employee.isError ? (
            <Alert
              severity="error"
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => void employee.refetch()}
                >
                  Try again
                </Button>
              }
            >
              Could not load this employee.{' '}
              {employee.error instanceof ApiError ? employee.error.message : ''}
            </Alert>
          ) : (
            <>
              <Details employee={employee.data} />
              <Typography
                variant="overline"
                component="h3"
                sx={{ mt: 4, mb: 0.5 }}
              >
                Salary history
              </Typography>
              <SalaryHistory entries={employee.data.salaryHistory} />
            </>
          )}
        </Box>

        <Divider />
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 1.5,
            p: 2,
          }}
        >
          {employee.data?.status === 'TERMINATED' && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mr: 'auto' }}
            >
              No salary changes for people who have left.
            </Typography>
          )}
          <Button variant="outlined" color="secondary" onClick={close}>
            Close
          </Button>
          {employee.data && employee.data.status === 'ACTIVE' && (
            <Button
              variant="contained"
              startIcon={<EditIcon />}
              onClick={() => setEditing(true)}
            >
              Edit salary
            </Button>
          )}
        </Box>
      </Drawer>
      {editing && employee.data && (
        <SalaryChangeDialog
          employee={employee.data}
          onClose={() => setEditing(false)}
          onSaved={() => setSaved(true)}
        />
      )}
      <Snackbar
        open={saved}
        autoHideDuration={6000}
        onClose={() => setSaved(false)}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setSaved(false)}
        >
          Salary saved. It is now in the history.
        </Alert>
      </Snackbar>
    </>
  );
}
