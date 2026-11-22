import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi, employeesApi, insightsApi } from '../../../api/index.ts';
import type { GenderGapInsights, PayInsights } from '../../../api/insights.ts';
import { paths } from '../../../app/paths.ts';
import { renderApp } from '../../../test/render-app.tsx';

const insights: PayInsights = {
  groupBy: 'country',
  asOf: '2026-11-20',
  currency: 'USD',
  minimumGroupSize: 5,
  overall: {
    headcount: 1403,
    p25Usd: '40000.00',
    medianUsd: '55000.00',
    p75Usd: '75000.00',
    totalAnnualUsd: '78000006.00',
  },
  groups: [
    {
      key: 'DE',
      label: 'Germany',
      headcount: 600,
      p25Usd: '60000.00',
      medianUsd: '70000.00',
      p75Usd: '85000.00',
      totalAnnualUsd: '42000000.00',
    },
    {
      key: 'IN',
      label: 'India',
      headcount: 800,
      p25Usd: '30000.00',
      medianUsd: '40000.00',
      p75Usd: '56000.00',
      totalAnnualUsd: '36000000.00',
    },
  ],
  hiddenGroups: 2,
  excluded: 1,
};

// Its numbers differ from the pay figures above, so a lookup by text never finds two.
const gap: GenderGapInsights = {
  asOf: '2026-11-20',
  currency: 'USD',
  minimumGroupSize: 5,
  overall: {
    women: { headcount: 11, medianUsd: '64000.00' },
    men: { headcount: 9, medianUsd: '72500.00' },
    gapPercent: '-11.7',
  },
  levels: [
    {
      level: 2,
      label: 'Level 2',
      women: { headcount: 5, medianUsd: '61000.00' },
      men: { headcount: 5, medianUsd: '66500.00' },
      gapPercent: '-8.3',
    },
    {
      level: 3,
      label: 'Level 3',
      women: { headcount: 8, medianUsd: '90500.00' },
      men: { headcount: 7, medianUsd: '88000.00' },
      gapPercent: '2.8',
    },
  ],
  hiddenLevels: 2,
  otherGender: 3,
  excluded: 0,
};

let pay: ReturnType<typeof vi.spyOn>;
let genderGap: ReturnType<typeof vi.spyOn>;

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
    countries: [
      { code: 'DE', name: 'Germany' },
      { code: 'IN', name: 'India' },
    ],
    departments: ['Engineering', 'Finance'],
    levels: [],
    jobTitles: [],
  });
  // The directory, for the test that opens this page from it.
  vi.spyOn(employeesApi, 'list').mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 25,
    total: 0,
  });
  pay = vi.spyOn(insightsApi, 'pay').mockResolvedValue(insights);
  genderGap = vi.spyOn(insightsApi, 'genderGap').mockResolvedValue(gap);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const lastBody = () => pay.mock.lastCall?.[0] as Record<string, unknown>;
const lastGapBody = () =>
  genderGap.mock.lastCall?.[0] as Record<string, unknown>;

async function open() {
  const user = userEvent.setup();
  renderApp(paths.insights);
  await screen.findByRole('heading', { name: 'Pay insights' });
  await screen.findByRole('table', { name: 'Pay by country' });
  // The filter lists arrive separately; wait for them before using a dropdown.
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Country' }),
    ).not.toHaveAttribute('aria-disabled', 'true'),
  );
  return user;
}

describe('the pay insights page', () => {
  it('opens from the directory', async () => {
    const user = userEvent.setup();
    renderApp(paths.employees);

    await user.click(await screen.findByRole('link', { name: 'Pay insights' }));

    expect(
      await screen.findByRole('heading', { name: 'Pay insights' }),
    ).toBeInTheDocument();
  });

  it('starts by country, showing everyone together and then each group with its median and middle half', async () => {
    await open();

    expect(lastBody()).toEqual({ groupBy: 'country' });
    expect(screen.getByText('1,403')).toBeInTheDocument(); // everyone together
    expect(screen.getByText('$55,000')).toBeInTheDocument(); // the overall median
    expect(screen.getByText('$40K to $75K')).toBeInTheDocument(); // the middle half
    expect(screen.getByText('$78M')).toBeInTheDocument(); // what they cost a year

    const table = screen.getByRole('table', { name: 'Pay by country' });
    const germany = within(table).getByRole('row', { name: /germany/i });
    expect(germany).toHaveTextContent('600');
    expect(germany).toHaveTextContent('$60,000'); // 25th percentile
    expect(germany).toHaveTextContent('$70,000'); // median
    expect(germany).toHaveTextContent('$85,000'); // 75th percentile
    expect(germany).toHaveTextContent('$42M');
  });

  it('asks for the other grouping when the person switches to departments, and to levels', async () => {
    const user = await open();

    await user.click(screen.getByRole('button', { name: 'By department' }));
    await waitFor(() => expect(lastBody()).toEqual({ groupBy: 'department' }));
    await user.click(screen.getByRole('button', { name: 'By level' }));
    await waitFor(() => expect(lastBody()).toEqual({ groupBy: 'level' }));
  });

  it('narrows the people to the chosen country, keeps the grouping, and goes back with "Clear filters"', async () => {
    const user = await open();

    await user.click(screen.getByRole('button', { name: 'By level' }));
    await user.click(screen.getByRole('combobox', { name: 'Country' }));
    await user.click(
      await within(await screen.findByRole('listbox')).findByRole('option', {
        name: 'India',
      }),
    );
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(lastBody()).toEqual({ groupBy: 'level', countries: ['IN'] }),
    );

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(lastBody()).toEqual({ groupBy: 'level' }));
  });

  it('says what it left out, and why, so a missing group is not a mystery', async () => {
    await open();

    expect(
      screen.getByText(
        /2 groups with fewer than 5 people are not shown, so that no one can be picked out/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 current employee has no salary or no exchange rate/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/salaries as they were on 20 nov 2026/i),
    ).toBeInTheDocument();
  });

  it('explains, and shows no table, when fewer than 5 people match the filters', async () => {
    pay.mockResolvedValue({
      ...insights,
      overall: null,
      groups: [],
      hiddenGroups: 1,
    });
    renderApp(paths.insights);

    expect(
      await screen.findByText(/fewer than 5 people match these filters/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('table', { name: 'Pay by country' }),
    ).not.toBeInTheDocument();
  });

  it('offers to try again when the figures could not be loaded', async () => {
    pay.mockRejectedValue(new Error('network down'));
    renderApp(paths.insights);

    expect(
      await screen.findByRole(
        'button',
        { name: 'Try again' },
        { timeout: 8000 },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/could not load the pay figures/i),
    ).toBeInTheDocument();
  });
});

describe('the gender pay gap on the insights page', () => {
  const gapTable = () =>
    screen.findByRole('table', { name: 'Gender pay gap by level' });

  it('compares women and men level by level, and says plainly which side is higher', async () => {
    await open();

    const table = await gapTable();
    const level2 = within(table).getByRole('row', { name: /level 2/i });
    expect(level2).toHaveTextContent('$61,000');
    expect(level2).toHaveTextContent('$66,500');
    expect(level2).toHaveTextContent('8.3% lower');
    expect(
      within(table).getByRole('row', { name: /level 3/i }),
    ).toHaveTextContent('2.8% higher');
    expect(screen.getByText(/overall: 11\.7% lower/i)).toHaveTextContent(
      '11 women',
    );
    expect(screen.getByText(/overall: 11\.7% lower/i)).toHaveTextContent(
      '9 men',
    );
  });

  it('asks for the same people as the pay figures, with no grouping, and follows the country choice', async () => {
    const user = await open();
    await gapTable();
    expect(lastGapBody()).toEqual({});

    await user.click(screen.getByRole('combobox', { name: 'Country' }));
    await user.click(
      await within(await screen.findByRole('listbox')).findByRole('option', {
        name: 'India',
      }),
    );
    await user.keyboard('{Escape}');

    await waitFor(() => expect(lastGapBody()).toEqual({ countries: ['IN'] }));
  });

  it('suggests choosing one country while all countries are mixed together, and stops once one is chosen', async () => {
    const user = await open();
    await gapTable();
    expect(
      screen.getByText(/choose one country above to compare like with like/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Country' }));
    await user.click(
      await within(await screen.findByRole('listbox')).findByRole('option', {
        name: 'India',
      }),
    );
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(
        screen.queryByText(
          /choose one country above to compare like with like/i,
        ),
      ).not.toBeInTheDocument(),
    );
  });

  it('says what it left out, and why', async () => {
    await open();
    await gapTable();

    expect(
      screen.getByText(
        /2 levels not shown: fewer than 5 women or fewer than 5 men there/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /3 employees of another gender are not part of this comparison/i,
      ),
    ).toBeInTheDocument();
  });

  it('explains, and shows no table, when there are too few women or men to compare', async () => {
    genderGap.mockResolvedValue({
      ...gap,
      overall: null,
      levels: [],
      hiddenLevels: 3,
    });
    await open();

    expect(
      await screen.findByText(
        /fewer than 5 women or fewer than 5 men match these filters/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('table', { name: 'Gender pay gap by level' }),
    ).not.toBeInTheDocument();
  });
});
