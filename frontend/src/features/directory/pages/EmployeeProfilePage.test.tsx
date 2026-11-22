import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EmployeeListItem,
  EmployeeProfile,
} from '../../../api/employees.ts';
import { ApiError, authApi, employeesApi } from '../../../api/index.ts';
import { paths } from '../../../app/paths.ts';
import { renderApp } from '../../../test/render-app.tsx';

const id = '5b1c6d0a-8f3e-4c52-9a1e-2d7f4b6a9c10';

const person: EmployeeListItem = {
  id,
  employeeCode: 'EMP-00001',
  fullName: 'Asha Rao',
  jobTitle: 'Staff Engineer',
  level: 3,
  department: 'Engineering',
  country: { code: 'GB', name: 'United Kingdom' },
  joiningDate: '2023-11-20',
  status: 'ACTIVE',
  terminatedOn: null,
  tenureBand: '1-3',
  currentSalary: {
    annualAmount: '48700.00',
    currencyCode: 'GBP',
    annualAmountUsd: '61646.00',
  },
  bandPosition: 'WITHIN',
};

const profile: EmployeeProfile = {
  ...person,
  salaryHistory: [
    {
      id: 'h3',
      annualAmount: '52000.00',
      currencyCode: 'GBP',
      effectiveFrom: '2027-04-01',
      reason: 'MERIT',
      changedBy: null,
      previous: { annualAmount: '48700.00', currencyCode: 'GBP' },
      changePercent: '6.8',
      state: 'SCHEDULED',
    },
    {
      id: 'h2',
      annualAmount: '48700.00',
      currencyCode: 'GBP',
      effectiveFrom: '2025-04-01',
      reason: 'PROMOTION',
      changedBy: 'Hana Tester',
      previous: { annualAmount: '44000.00', currencyCode: 'GBP' },
      changePercent: '10.7',
      state: 'CURRENT',
    },
    {
      id: 'h1',
      annualAmount: '44000.00',
      currencyCode: 'GBP',
      effectiveFrom: '2023-11-20',
      reason: 'HIRE',
      changedBy: null,
      previous: null,
      changePercent: null,
      state: 'PAST',
    },
  ],
};

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
  vi.spyOn(employeesApi, 'filterOptions').mockResolvedValue({
    countries: [],
    departments: [],
    levels: [],
    jobTitles: [],
  });
  vi.spyOn(employeesApi, 'list').mockResolvedValue({
    items: [person],
    page: 1,
    pageSize: 25,
    total: 1,
  });
  vi.spyOn(employeesApi, 'get').mockResolvedValue(profile);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const openProfile = () => screen.findByRole('dialog', { name: 'Asha Rao' });

describe('an employee profile', () => {
  it('shows the details and the salary history, newest first, with what each step changed', async () => {
    renderApp(paths.employee(id));

    const panel = within(await openProfile());

    expect(await panel.findByText('EMP-00001')).toBeInTheDocument();
    expect(panel.getByText('Staff Engineer')).toBeInTheDocument();
    // The same amount is also in the history, so look at the field by its label.
    expect(panel.getByText('Annual salary').parentElement).toHaveTextContent(
      '£48,700',
    );
    expect(panel.getByText('In USD').parentElement).toHaveTextContent(
      '$61,646',
    );

    const steps = panel.getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    // The scheduled raise is first, marked as not yet in force; the seed recorded it, so no "by".
    expect(steps[0]).toHaveTextContent('Merit increase');
    expect(steps[0]).toHaveTextContent('Scheduled');
    expect(steps[0]).toHaveTextContent('1 Apr 2027 · from £48,700');
    expect(steps[0]).toHaveTextContent('+6.8%');
    // The salary in force: marked, with who recorded it.
    expect(steps[1]).toHaveTextContent('Promotion');
    expect(steps[1]).toHaveTextContent(
      '1 Apr 2025 · from £44,000 · by Hana Tester',
    );
    expect(
      within(steps[1]!).getByRole('img', { name: 'Current salary' }),
    ).toBeInTheDocument();
    // The first salary has nothing before it to compare with.
    expect(steps[2]).toHaveTextContent('Joined ACME');
    expect(steps[2]).not.toHaveTextContent('%');
  });

  it('opens from a click on a row, and closing it leaves the directory as the user left it', async () => {
    const user = userEvent.setup();
    const { router } = renderApp(paths.employees);
    await screen.findByRole('heading', { name: 'Employees' });

    await user.click(screen.getByRole('button', { name: 'Left' }));
    await user.click(await screen.findByText('Staff Engineer'));

    await openProfile();
    expect(router.state.location.pathname).toBe(paths.employee(id));

    // Two ways to close it, as in the design: the X in the corner and the Close button.
    await user.click(screen.getAllByRole('button', { name: 'Close' })[1]!);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(paths.employees),
    );
    // Closing stepped back, so Back does not bring the profile back.
    expect(router.state.historyAction).toBe('POP');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The directory behind it was never rebuilt, so the filter chosen before opening is kept.
    expect(screen.getByRole('button', { name: 'Left' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('opens from the name with the keyboard, as one step in the history, not two', async () => {
    const user = userEvent.setup();
    const { router } = renderApp(paths.employees);
    const link = await screen.findByRole('link', { name: 'Asha Rao' });
    expect(link).toHaveAttribute('href', paths.employee(id));
    expect(router.state.historyAction).toBe('POP');

    link.focus();
    await user.keyboard('{Enter}');

    await openProfile();
    expect(router.state.location.pathname).toBe(paths.employee(id));
    expect(router.state.historyAction).toBe('PUSH');
    // One step back is enough to leave the profile.
    await router.navigate(-1);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(paths.employees),
    );
  });

  it('says so, with a way out, when the employee does not exist', async () => {
    vi.spyOn(employeesApi, 'get').mockRejectedValue(
      new ApiError(404, 'Employee not found'),
    );

    const { router } = renderApp(paths.employee(id));

    expect(
      await screen.findByText(/this employee does not exist/i),
    ).toBeInTheDocument();
    // Opened from a link, there is nothing to step back to: Close goes to the directory.
    await userEvent
      .setup()
      .click(screen.getAllByRole('button', { name: 'Close' })[1]!);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(paths.employees),
    );
  });
});

describe('editing a salary from the profile', () => {
  const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(
      await screen.findByRole('button', { name: 'Edit salary' }),
    );
    return within(await screen.findByRole('dialog', { name: /edit salary/i }));
  };

  it('saves the amount as the text typed, then shows the new step in the history', async () => {
    const saved: EmployeeProfile = {
      ...profile,
      salaryHistory: [
        {
          id: 'h4',
          annualAmount: '52000.50',
          currencyCode: 'GBP',
          effectiveFrom: '2026-11-21',
          reason: 'MARKET_ADJUSTMENT',
          changedBy: 'Hana Rao',
          previous: { annualAmount: '48700.00', currencyCode: 'GBP' },
          changePercent: '6.8',
          state: 'CURRENT',
        },
        ...profile.salaryHistory,
      ],
    };
    const addSalaryChange = vi
      .spyOn(employeesApi, 'addSalaryChange')
      .mockResolvedValue(saved);
    const user = userEvent.setup();
    renderApp(paths.employee(id));

    const dialog = await openDialog(user);
    await user.type(dialog.getByLabelText('New annual salary'), '52000.50');
    // What will be saved is read back, so a misplaced decimal point shows before saving.
    expect(
      await dialog.findByText(/will be recorded as £52,000\.50/i),
    ).toBeInTheDocument();
    await user.click(dialog.getByRole('combobox', { name: 'Reason' }));
    await user.click(
      await screen.findByRole('option', { name: 'Market adjustment' }),
    );
    await user.click(dialog.getByRole('button', { name: 'Save salary' }));

    await waitFor(() =>
      expect(addSalaryChange).toHaveBeenCalledExactlyOnceWith(id, {
        annualAmount: '52000.50',
        effectiveFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
        reason: 'MARKET_ADJUSTMENT',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /edit salary/i })).toBeNull(),
    );
    expect(await screen.findByText(/salary saved/i)).toBeInTheDocument();
    const steps = within(await openProfile()).getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    expect(steps[0]).toHaveTextContent('Market adjustment');
    expect(steps[0]).toHaveTextContent('by Hana Rao');
  });

  it('points out an amount the API would refuse, and sends nothing', async () => {
    const addSalaryChange = vi.spyOn(employeesApi, 'addSalaryChange');
    const user = userEvent.setup();
    renderApp(paths.employee(id));

    const dialog = await openDialog(user);
    await user.type(dialog.getByLabelText('New annual salary'), '52,000');
    await user.click(dialog.getByRole('button', { name: 'Save salary' }));

    expect(dialog.getByText(/use digits only/i)).toBeInTheDocument();
    // The reason was not chosen either.
    expect(dialog.getByText(/choose why/i)).toBeInTheDocument();
    expect(addSalaryChange).not.toHaveBeenCalled();
  });

  it('keeps the form open, with the API’s reason, when the API refuses', async () => {
    vi.spyOn(employeesApi, 'addSalaryChange').mockRejectedValue(
      new ApiError(
        400,
        'The effective date cannot be before the joining date (2023-11-20).',
      ),
    );
    const user = userEvent.setup();
    renderApp(paths.employee(id));

    const dialog = await openDialog(user);
    await user.type(dialog.getByLabelText('New annual salary'), '52000');
    await user.click(dialog.getByRole('combobox', { name: 'Reason' }));
    await user.click(await screen.findByRole('option', { name: 'Correction' }));
    await user.click(dialog.getByRole('button', { name: 'Save salary' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'before the joining date',
    );
    expect(dialog.getByRole('button', { name: 'Save salary' })).toBeEnabled();
  });

  it('offers no way to change the salary of someone who has left', async () => {
    vi.spyOn(employeesApi, 'get').mockResolvedValue({
      ...profile,
      status: 'TERMINATED',
      terminatedOn: '2026-03-31',
    });

    renderApp(paths.employee(id));

    expect(
      await screen.findByText(/no salary changes for people who have left/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit salary' })).toBeNull();
  });
});
