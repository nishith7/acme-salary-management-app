import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState, type FormEvent } from 'react';
import type { EmployeeProfile } from '../../../api/employees.ts';
import { ApiError } from '../../../api/index.ts';
import { formatAmount, formatMoney, salaryChangeTitle } from '../format.ts';
import {
  initialSalaryChangeForm,
  reasonsFor,
  toSalaryChangeRequest,
  validateSalaryChange,
  type SalaryChangeForm,
} from '../salary-change-form.ts';
import { useRecordSalaryChange } from '../use-record-salary-change.ts';

interface SalaryChangeDialogProps {
  employee: EmployeeProfile;
  onClose: () => void;
  /** Called once the new salary is saved, after which the dialog is closed. */
  onSaved: () => void;
}

/**
 * The "Edit salary" form. It never changes a salary in place: saving adds a new entry to the
 * history, which is why the person chooses a date and a reason. The currency is not asked
 * for; the API uses the one the person is paid in. Mount it only while it is open, so every
 * opening starts with a fresh form.
 */
export function SalaryChangeDialog({
  employee,
  onClose,
  onSaved,
}: SalaryChangeDialogProps) {
  const hasSalary = employee.salaryHistory.length > 0;
  const current = employee.currentSalary;
  const [form, setForm] = useState<SalaryChangeForm>(() =>
    initialSalaryChangeForm(hasSalary, employee.joiningDate),
  );
  // Mistakes are pointed out after the first attempt to save, not while the person types.
  const [attempted, setAttempted] = useState(false);
  const record = useRecordSalaryChange(employee.id);

  const errors = validateSalaryChange(form, employee.joiningDate);
  const show = (field: keyof SalaryChangeForm) =>
    attempted ? errors[field] : undefined;

  function update(change: Partial<SalaryChangeForm>) {
    setForm((previous) => ({ ...previous, ...change }));
    record.reset(); // an old server message is about the old values
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(errors).length > 0 || form.reason === '') {
      return;
    }
    record.mutate(toSalaryChangeRequest({ ...form, reason: form.reason }), {
      onSuccess: () => {
        onSaved();
        onClose();
      },
    });
  }

  // What will be saved, as the person will read it: the best protection against a
  // misplaced decimal point or a dropped zero. Only shown for an amount that is valid.
  const amountOk = errors.annualAmount === undefined;
  const preview = amountOk
    ? `${
        current
          ? formatMoney(form.annualAmount.trim(), current.currencyCode)
          : formatAmount(form.annualAmount.trim())
      } a year`
    : undefined;

  return (
    <Dialog
      open
      onClose={record.isPending ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="salary-change-title"
    >
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle id="salary-change-title">
          Edit salary: {employee.fullName}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField
              label="New annual salary"
              value={form.annualAmount}
              onChange={(event) => update({ annualAmount: event.target.value })}
              error={show('annualAmount') !== undefined}
              helperText={
                show('annualAmount') ??
                (preview
                  ? `Will be recorded as ${preview}`
                  : current
                    ? `Currently ${formatMoney(current.annualAmount, current.currencyCode)} a year`
                    : ' ')
              }
              autoFocus
              slotProps={{
                htmlInput: { inputMode: 'decimal', autoComplete: 'off' },
                input: {
                  startAdornment: current ? (
                    <InputAdornment position="start">
                      {current.currencyCode}
                    </InputAdornment>
                  ) : undefined,
                },
              }}
            />
            <TextField
              label="Effective from"
              type="date"
              value={form.effectiveFrom}
              onChange={(event) =>
                update({ effectiveFrom: event.target.value })
              }
              error={show('effectiveFrom') !== undefined}
              helperText={
                show('effectiveFrom') ?? 'A future date schedules the change.'
              }
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { min: employee.joiningDate },
              }}
            />
            <TextField
              label="Reason"
              select
              value={form.reason}
              onChange={(event) =>
                update({
                  reason: event.target.value as SalaryChangeForm['reason'],
                })
              }
              error={show('reason') !== undefined}
              helperText={show('reason') ?? ' '}
            >
              {reasonsFor(hasSalary).map((reason) => (
                <MenuItem key={reason} value={reason}>
                  {salaryChangeTitle(reason)}
                </MenuItem>
              ))}
            </TextField>
            {record.isError && (
              <Alert severity="error">
                {record.error instanceof ApiError
                  ? record.error.message
                  : 'Could not save the salary. Try again.'}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            color="secondary"
            variant="outlined"
            onClick={onClose}
            disabled={record.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={record.isPending}>
            Save salary
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
