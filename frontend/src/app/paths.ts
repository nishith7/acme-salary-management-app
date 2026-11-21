/** Every URL path in the app, in one place, so a path is never typed twice. */
export const paths = {
  login: '/login',
  employees: '/employees',
  /** Changing many salaries from a spreadsheet. */
  salaryUpdates: '/salary-updates',
  /** How people are paid, by country, department and level. */
  insights: '/insights',
  /** An employee's profile, opened over the directory. */
  employee: (id: string) => `/employees/${encodeURIComponent(id)}`,
} as const;
