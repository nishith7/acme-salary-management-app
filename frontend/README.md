# ACME Salary Management: frontend

React 19 + Vite 8 + TypeScript, with Material UI (see `docs/tech-stack.md`, decisions 15 to
17). Built so far: the API client, the theme, sign-in with protected routes, and the
employee directory (table with paging and sorting, search and filters, a profile panel with
the salary history, and recording a salary change). The summary cards and adding, editing and
terminating employees come later.

## Source layout

```
src/
  api/        the one axios client (token in memory, one shared silent refresh) and the typed calls
  app/        wiring: providers, the route table (routes.tsx), route paths, the query client
  components/ shared UI that knows nothing about a feature (BrandLogo, FullPageLoader)
  features/   one folder per feature, each with its own components/ and pages/
    auth/       session state, RequireAuth and PublicOnly (the route guards), the login page
    directory/  the employee table: columns, cell parts, formatting, the query hook, the page,
                and the search box and filters above it (`filters.ts` turns them into the request body)
    salary-updates/  the bulk salary update: download the template, choose a CSV, see every row checked
    insights/  pay by country, department and level (medians and quartiles in US dollars) and the gender pay gap by level; groups under 5 people hidden
  layouts/    frames around screens (AppShell: top bar, who is signed in, sign out)
  lib/        small helpers with no UI (saving a downloaded file)
  pages/      screens that belong to no feature (not found, no access)
  theme/      the MUI theme: palette.ts, typography.ts, components.ts
  test/       test helpers (renderApp mounts the real providers and routes)
```

Rules of thumb: a screen goes in `features/<name>/pages/` and its route inside `RequireAuth`
in `app/routes.tsx`; a component used by two features moves up to `components/`; colours,
fonts and component defaults live only in `theme/`, and screens use theme tokens
(`'primary.main'`), never hard-coded colours.

## Sign-in and protected routes

The access token lives in memory only, so every page load restores the session from the
httpOnly refresh cookie before any route is decided (`AuthProvider`, with a loader meanwhile).
`RequireAuth` then sends a signed-out visitor to `/login` (remembering where they were going)
and shows a no-access page to anyone who is not an HR admin. `PublicOnly` moves a signed-in
user off the login page. The guards are a courtesy: the API checks every call again, and that
is what protects the data. When a session ends, by sign-out or because the server refused to
renew it, the data cache is cleared so the next person on this browser sees nothing of it.

## First time

Copy `.env.example` to `.env` (git ignores it, as with the backend) and start the backend.
One value is required and has **no default**, because a wrong guess looks like the API being
down or like being signed out:

| Variable       | What it is                                                                                |
| -------------- | ----------------------------------------------------------------------------------------- |
| `VITE_API_URL` | the backend's address, `http://localhost:<PORT>` (`PORT` in `backend/.env`, default 3000) |

The app refuses to load without it, and says so. The tests and the build do not need it (the
tests set their own). The backend must allow the frontend's address: put
`CORS_ORIGINS=http://localhost:5173` in `backend/.env` (it is in `backend/.env.example`).

## Commands

| Command                | Purpose                                           |
| ---------------------- | ------------------------------------------------- |
| `npm run dev`          | dev server on http://localhost:5173               |
| `npm test`             | unit tests (Vitest, jsdom, Testing Library)       |
| `npm run lint`         | Oxlint                                            |
| `npm run format:check` | Prettier check (`npm run format` fixes)           |
| `npm run build`        | type check (`tsc -b`), then the production bundle |
| `npm run preview`      | serve the production bundle locally               |

Before every commit: `npm run lint && npm run format:check && npm test && npm run build`.

## Talking to the API

The browser calls the backend directly, at the address in `VITE_API_URL`: what you see in the
browser's network tab is `http://localhost:3000/auth/login`, and so on. The frontend and the
backend are on different ports, so the backend lists the frontend's address in `CORS_ORIGINS`
and the client sends the refresh cookie with each call (`withCredentials`). A different port on
`localhost` is the same site, so the cookie (SameSite=Strict) is still sent.

Environment variables, and what each one is for, are in `.env.example`.

## CI and deploy

- `.github/workflows/frontend-ci.yml` runs lint, format check, tests and build on every
  push to `main` and every pull request that touches `frontend/`.
- `.github/workflows/frontend-deploy-pages.yml` publishes the site to GitHub Pages. It is
  started by hand from the Actions tab. Setup: Settings > Pages > Source = "GitHub
  Actions", and a repository variable `VITE_API_URL` with the API's full URL.

**Caveat for Pages:** the site (`<user>.github.io`) and the API are different sites, so the
refresh cookie becomes a third-party cookie, which Safari and some other browsers block.
The same applies to any host where the site and the API are on different sites, such as
Vercel and Render. Production needs one of: the site and the API under one site (for example
`app.example.com` and `api.example.com`), or a host that forwards `/api/*` to the API (then
`VITE_API_URL=/api`, and the cookie path must be fixed too), or a cookie that allows
cross-site use (`SameSite=None; Secure`). For the demo the API uses the last: set `REFRESH_COOKIE_SAMESITE=none` on it (see `backend/README.md`), which works in Chrome, Edge and Firefox and not in Safari.
