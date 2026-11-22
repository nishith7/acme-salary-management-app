import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient, authApi, employeesApi } from '../api/index.ts';
import type { AuthUser, LoginResponse } from '../api/types.ts';
import { renderApp } from '../test/render-app.tsx';

const hr: AuthUser = {
  id: 'u1',
  email: 'hr@acme.test',
  name: 'Hana Rao',
  role: 'HR_ADMIN',
};
const sessionOf = (user: AuthUser): LoginResponse => ({
  accessToken: 'token',
  expiresIn: 900,
  user,
});
const noSession = () => new ApiError(401, 'Unauthorized');

const signInHeading = () => screen.findByRole('heading', { name: 'Sign in' });
const employeesHeading = () =>
  screen.findByRole('heading', { name: 'Employees' });

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
  password: string,
) {
  await user.type(screen.getByLabelText('Work email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  // These tests are about signing in and routing, not the directory. The signed-in page does
  // ask the API for employees, so give it an empty answer rather than let it reach for the
  // network (a failed load would put a second alert on screen).
  vi.spyOn(employeesApi, 'list').mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 25,
    total: 0,
  });
  vi.spyOn(employeesApi, 'filterOptions').mockResolvedValue({
    countries: [],
    departments: [],
    levels: [],
    jobTitles: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('protected routes', () => {
  it('shows a loader, then the page, while the session is restored from the refresh cookie', async () => {
    let restored!: (session: LoginResponse) => void;
    vi.spyOn(authApi, 'restoreSession').mockReturnValue(
      new Promise((resolve) => {
        restored = resolve;
      }),
    );

    renderApp('/employees');

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Employees' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Sign in' }),
    ).not.toBeInTheDocument();

    await act(async () => restored(sessionOf(hr)));

    expect(await employeesHeading()).toBeInTheDocument();
  });

  it('sends a signed-out visitor to the login page and, after signing in, back to the page they asked for', async () => {
    vi.spyOn(authApi, 'restoreSession').mockRejectedValue(noSession());
    const login = vi.spyOn(authApi, 'login').mockResolvedValue(sessionOf(hr));
    const user = userEvent.setup();

    const { router } = renderApp('/employees?search=ann');
    await signInHeading();
    expect(router.state.location.pathname).toBe('/login');

    await fillAndSubmit(user, 'hr@acme.test', 'correct horse');

    expect(login).toHaveBeenCalledWith({
      email: 'hr@acme.test',
      password: 'correct horse',
    });
    expect(await employeesHeading()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/employees');
    expect(router.state.location.search).toBe('?search=ann');
  });

  it('sends an already signed-in user away from the login page', async () => {
    vi.spyOn(authApi, 'restoreSession').mockResolvedValue(sessionOf(hr));

    const { router } = renderApp('/login');

    expect(await employeesHeading()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/employees');
  });

  it('shows a no-access page, not the directory, to a signed-in user who is not an HR admin', async () => {
    vi.spyOn(authApi, 'restoreSession').mockResolvedValue(
      sessionOf({ ...hr, role: 'EMPLOYEE' }),
    );

    renderApp('/employees');

    expect(
      await screen.findByRole('heading', { name: "You don't have access" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Employees' }),
    ).not.toBeInTheDocument();
  });
});

describe('the login form', () => {
  it('shows the API message and stays on the login page when the password is wrong', async () => {
    vi.spyOn(authApi, 'restoreSession').mockRejectedValue(noSession());
    vi.spyOn(authApi, 'login').mockRejectedValue(
      new ApiError(401, 'Invalid email or password'),
    );
    const user = userEvent.setup();

    renderApp('/login');
    await signInHeading();
    await fillAndSubmit(user, 'hr@acme.test', 'wrong');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password',
    );
    expect(
      screen.getByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
  });

  it('does not call the API for an incomplete form, because every attempt counts against the login rate limit', async () => {
    vi.spyOn(authApi, 'restoreSession').mockRejectedValue(noSession());
    const login = vi.spyOn(authApi, 'login');
    const user = userEvent.setup();

    renderApp('/login');
    await signInHeading();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(login).not.toHaveBeenCalled();
    expect(screen.getByText('Enter your work email.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
  });
});

describe('ending a session', () => {
  it('returns to the login page and clears cached data when the user signs out', async () => {
    vi.spyOn(authApi, 'restoreSession').mockResolvedValue(sessionOf(hr));
    const logout = vi.spyOn(authApi, 'logout').mockResolvedValue();
    const user = userEvent.setup();

    const { queryClient } = renderApp('/employees');
    await employeesHeading();
    queryClient.setQueryData(['employees'], { total: 10000 });

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await signInHeading()).toBeInTheDocument();
    expect(logout).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(['employees'])).toBeUndefined();
  });

  it('stays signed in and says so when the server could not be told about the sign-out', async () => {
    vi.spyOn(authApi, 'restoreSession').mockResolvedValue(sessionOf(hr));
    vi.spyOn(authApi, 'logout').mockRejectedValue(new ApiError(0, 'offline'));
    const user = userEvent.setup();

    renderApp('/employees');
    await employeesHeading();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not sign out',
    );
    expect(
      screen.getByRole('heading', { name: 'Employees' }),
    ).toBeInTheDocument();
  });

  it('returns to the login page with a notice, and clears cached data, when the session expires', async () => {
    vi.spyOn(authApi, 'restoreSession').mockResolvedValue(sessionOf(hr));
    let expire: () => void = () => {};
    vi.spyOn(apiClient, 'onSessionExpired').mockImplementation((handler) => {
      expire = handler;
      return () => {};
    });

    const { queryClient } = renderApp('/employees');
    await employeesHeading();
    queryClient.setQueryData(['employees'], { total: 10000 });

    act(() => expire());

    expect(await signInHeading()).toBeInTheDocument();
    expect(screen.getByText(/your session expired/i)).toBeInTheDocument();
    expect(queryClient.getQueryData(['employees'])).toBeUndefined();
  });
});
