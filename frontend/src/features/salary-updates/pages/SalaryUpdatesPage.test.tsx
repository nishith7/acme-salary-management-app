import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  authApi,
  employeesApi,
  salaryUpdatesApi,
} from '../../../api/index.ts';
import type { SalaryUpdateReport } from '../../../api/salary-updates.ts';
import { paths } from '../../../app/paths.ts';
import { saveBlob } from '../../../lib/save-file.ts';
import { renderApp } from '../../../test/render-app.tsx';

// Saving a file is the browser's job; the tests only need to know it was asked to.
vi.mock('../../../lib/save-file.ts', () => ({ saveBlob: vi.fn() }));

const report: SalaryUpdateReport = {
  fileProblems: [],
  rows: [
    {
      line: 2,
      employeeCode: 'EMP-00001',
      fullName: 'Asha Rao',
      outcome: 'WILL_UPDATE',
      errors: [],
      warnings: [
        'A raise of 60.0% is unusually large: check the amount for a typo.',
      ],
      change: {
        annualAmount: '80000',
        currencyCode: 'GBP',
        effectiveFrom: '2026-12-01',
        reason: 'MERIT',
        previousAmount: '50000.00',
        changePercent: '60.0',
      },
    },
    {
      line: 3,
      employeeCode: 'EMP-99999',
      fullName: null,
      outcome: 'ERROR',
      errors: ['No employee has the Employee ID EMP-99999.'],
      warnings: [],
      change: null,
    },
    {
      line: 4,
      employeeCode: 'EMP-00003',
      fullName: 'Cy Gamma',
      outcome: 'UNCHANGED',
      errors: [],
      warnings: [],
      change: null,
    },
    {
      line: 5,
      employeeCode: 'EMP-00004',
      fullName: 'Dee Delta',
      outcome: 'WILL_UPDATE',
      errors: [],
      warnings: [],
      change: {
        annualAmount: '41000.50',
        currencyCode: 'EUR',
        effectiveFrom: '2026-12-01',
        reason: 'PROMOTION',
        previousAmount: '40000.00',
        changePercent: '2.5',
      },
    },
  ],
  summary: {
    rows: 4,
    willUpdate: 2,
    unchanged: 1,
    errors: 1,
    withWarnings: 1,
    notRequested: 7,
  },
};

const csvText =
  'Employee ID,New annual salary,Effective from,Reason\r\nEMP-00001,80000,2026-12-01,Merit\r\n';
const csvFile = (name = 'salary.csv') =>
  new File([csvText], name, { type: 'text/csv' });

beforeEach(() => {
  vi.spyOn(authApi, 'restoreSession').mockResolvedValue({
    accessToken: 'token',
    expiresIn: 900,
    user: {
      id: 'u1',
      email: 'hr@acme.test',
      name: 'Hana Rao',
      role: 'HR_ADMIN',
    },
  });
  // The directory page, used by the test that opens this page from it.
  vi.spyOn(employeesApi, 'list').mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 25,
    total: 0,
  });
  vi.spyOn(employeesApi, 'filterOptions').mockResolvedValue({
    countries: [],
    departments: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(saveBlob).mockClear();
});

// A browser lets people choose "All files", so a file that does not match `accept` can arrive.
const setup = () => userEvent.setup({ applyAccept: false });
const chooseFile = (user: ReturnType<typeof setup>, file: File) =>
  user.upload(screen.getByLabelText(/choose csv file/i), file);

describe('the bulk salary update page', () => {
  it('opens from the directory', async () => {
    const user = setup();
    renderApp(paths.employees);

    await user.click(await screen.findByRole('link', { name: 'Bulk update' }));

    expect(
      await screen.findByRole('heading', { name: 'Bulk salary update' }),
    ).toBeInTheDocument();
  });

  it('sends the file’s text untouched, then shows the counts and, first, the rows that need attention', async () => {
    const preview = vi
      .spyOn(salaryUpdatesApi, 'preview')
      .mockResolvedValue(report);
    const user = setup();
    renderApp(paths.salaryUpdates);
    await screen.findByRole('heading', { name: 'Bulk salary update' });

    await chooseFile(user, csvFile());

    await waitFor(() => expect(preview).toHaveBeenCalledOnce());
    expect(preview.mock.calls[0]?.[0]).toBe(csvText);
    // The counts, as the API worked them out.
    expect(
      (await screen.findByText('will be updated')).previousElementSibling,
    ).toHaveTextContent('2');
    expect(
      screen.getByText('with errors, to fix').previousElementSibling,
    ).toHaveTextContent('1');
    expect(
      screen.getByText('left empty (ignored)').previousElementSibling,
    ).toHaveTextContent('7');
    // It opens on the problem and the warning, and not on the rows that are fine.
    expect(
      screen.getByText(/no employee has the employee id emp-99999/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/unusually large/i)).toBeInTheDocument();
    expect(screen.queryByText('Cy Gamma')).not.toBeInTheDocument();
    expect(screen.queryByText('Dee Delta')).not.toBeInTheDocument();
  });

  it('shows what each row would record, in the currency the person is paid in, when "Will update" is chosen', async () => {
    vi.spyOn(salaryUpdatesApi, 'preview').mockResolvedValue(report);
    const user = setup();
    renderApp(paths.salaryUpdates);
    await screen.findByRole('heading', { name: 'Bulk salary update' });
    await chooseFile(user, csvFile());
    await screen.findByText('will be updated');

    await user.click(screen.getByRole('button', { name: 'Will update' }));

    const grid = screen.getByRole('grid', { name: 'Rows of the file' });
    expect(within(grid).getByText('£50,000 → £80,000')).toBeInTheDocument();
    expect(within(grid).getByText('+60.0%')).toBeInTheDocument();
    expect(within(grid).getByText('€40,000 → €41,000.50')).toBeInTheDocument();
    expect(within(grid).getByText('+2.5%')).toBeInTheDocument();
    expect(within(grid).getByText('Promotion')).toBeInTheDocument();
  });

  it('says what is wrong with a file that cannot be used, and shows no table', async () => {
    vi.spyOn(salaryUpdatesApi, 'preview').mockResolvedValue({
      fileProblems: [
        'The file is missing the column "Reason". Download the template to get the right columns.',
      ],
      rows: [],
      summary: {
        rows: 0,
        willUpdate: 0,
        unchanged: 0,
        errors: 0,
        withWarnings: 0,
        notRequested: 0,
      },
    });
    const user = setup();
    renderApp(paths.salaryUpdates);
    await screen.findByRole('heading', { name: 'Bulk salary update' });

    await chooseFile(user, csvFile());

    expect(await screen.findByText(/cannot be used/i)).toBeInTheDocument();
    expect(screen.getByText(/missing the column "Reason"/)).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('turns away an Excel workbook with what to do instead, without sending it', async () => {
    const preview = vi.spyOn(salaryUpdatesApi, 'preview');
    const user = setup();
    renderApp(paths.salaryUpdates);
    await screen.findByRole('heading', { name: 'Bulk salary update' });

    await chooseFile(user, csvFile('salaries.xlsx'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Save As > CSV');
    expect(preview).not.toHaveBeenCalled();
  });

  it('downloads the template', async () => {
    const file = new Blob(['Employee ID\r\n'], { type: 'text/csv' });
    vi.spyOn(salaryUpdatesApi, 'template').mockResolvedValue(file);
    const user = setup();
    renderApp(paths.salaryUpdates);

    await user.click(
      await screen.findByRole('button', { name: /download template/i }),
    );

    await waitFor(() =>
      expect(saveBlob).toHaveBeenCalledExactlyOnceWith(
        file,
        'salary-update-template.csv',
      ),
    );
  });

  it('downloads an error report with the rows that have errors, and only those', async () => {
    vi.spyOn(salaryUpdatesApi, 'preview').mockResolvedValue(report);
    const user = setup();
    renderApp(paths.salaryUpdates);
    await screen.findByRole('heading', { name: 'Bulk salary update' });
    await chooseFile(user, csvFile());

    await user.click(
      await screen.findByRole('button', { name: /download error report/i }),
    );

    expect(saveBlob).toHaveBeenCalledOnce();
    const [blob, name] = vi.mocked(saveBlob).mock.calls[0] ?? [];
    expect(name).toBe('salary-update-errors.csv');
    const text = await (blob as Blob).text();
    expect(text).toContain(
      '3,EMP-99999,No employee has the Employee ID EMP-99999.',
    );
    expect(text).not.toContain('EMP-00001');
  });
});

describe('applying a bulk salary update', () => {
  const clean: SalaryUpdateReport = {
    fileProblems: [],
    rows: [report.rows[3]!],
    summary: {
      rows: 1,
      willUpdate: 1,
      unchanged: 0,
      errors: 0,
      withWarnings: 0,
      notRequested: 0,
    },
  };
  const nothing: SalaryUpdateReport = {
    fileProblems: [],
    rows: [report.rows[1]!],
    summary: {
      rows: 1,
      willUpdate: 0,
      unchanged: 0,
      errors: 1,
      withWarnings: 0,
      notRequested: 0,
    },
  };

  async function preview(report: SalaryUpdateReport) {
    vi.spyOn(salaryUpdatesApi, 'preview').mockResolvedValue(report);
    const user = setup();
    renderApp(paths.salaryUpdates);
    await screen.findByRole('heading', { name: 'Bulk salary update' });
    await chooseFile(user, csvFile());
    await screen.findByText('will be updated');
    return user;
  }

  it('keeps Apply off until the person says they have looked at the errors and the warnings, then applies the same file and says what happened', async () => {
    const apply = vi.spyOn(salaryUpdatesApi, 'apply').mockResolvedValue({
      importId: '9d3c5e1a-7b24-4f60-8a1d-3c5e7f9b2a46',
      applied: 2,
      unchanged: 1,
      skipped: 1,
    });
    const user = await preview(report);
    const button = screen.getByRole('button', {
      name: 'Apply 2 salary changes',
    });

    expect(button).toBeDisabled();
    await user.click(
      screen.getByRole('checkbox', { name: /i have looked at the rows/i }),
    );
    expect(button).toBeEnabled();
    await user.click(button);

    // The same text that was checked goes back, with the file's name for the record.
    await waitFor(() =>
      expect(apply).toHaveBeenCalledExactlyOnceWith(csvText, 'salary.csv'),
    );
    expect(
      await screen.findByText(/2 salary changes added/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /1 row was already at that salary and 1 row was skipped/i,
      ),
    ).toBeInTheDocument();
    // The check is gone, so the old result cannot be applied twice.
    expect(
      screen.queryByRole('button', { name: /apply/i }),
    ).not.toBeInTheDocument();
  });

  it('says what it will skip and what it will apply, in the confirmation itself', async () => {
    await preview(report);

    expect(
      screen.getByRole('checkbox', {
        name: /1 row with errors will be skipped, 1 row marked check will be applied/i,
      }),
    ).toBeInTheDocument();
  });

  it('needs no confirmation for a file with nothing to double-check', async () => {
    vi.spyOn(salaryUpdatesApi, 'apply').mockResolvedValue({
      importId: 'x',
      applied: 1,
      unchanged: 0,
      skipped: 0,
    });
    const user = await preview(clean);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Apply 1 salary change' }),
    );

    expect(
      await screen.findByText(/1 salary change added/i),
    ).toBeInTheDocument();
  });

  it('offers nothing to apply when no row would change a salary', async () => {
    await preview(nothing);

    expect(screen.getByText(/nothing to apply/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^apply/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps the check on screen, with the API’s reason, when applying fails', async () => {
    vi.spyOn(salaryUpdatesApi, 'apply').mockRejectedValue(
      new ApiError(400, 'The file is missing the column "Reason".'),
    );
    const user = await preview(clean);

    await user.click(
      screen.getByRole('button', { name: 'Apply 1 salary change' }),
    );

    expect(
      await screen.findByText(/missing the column "Reason"/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Apply 1 salary change' }),
    ).toBeEnabled();
  });

  it('says when nothing was added because the data had moved on since the check', async () => {
    vi.spyOn(salaryUpdatesApi, 'apply').mockResolvedValue({
      importId: null,
      applied: 0,
      unchanged: 1,
      skipped: 0,
    });
    const user = await preview(clean);

    await user.click(
      screen.getByRole('button', { name: 'Apply 1 salary change' }),
    );

    expect(await screen.findByText(/nothing was added/i)).toBeInTheDocument();
  });
});
