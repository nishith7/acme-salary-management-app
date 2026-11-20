# ACME Salary Management: frontend

React 19 + Vite 8 + TypeScript, with Material UI (see `docs/tech-stack.md`, decisions 15 to
17). Built so far: the API client, the theme, sign-in with protected routes, and a
placeholder employee page. The employee directory is next.

## Source layout

```
src/
  api/        the one axios client (token in memory, one shared silent refresh) and the typed calls
  app/        wiring: providers, the route table (routes.tsx), route paths, the query client
  components/ shared UI that knows nothing about a feature (BrandLogo, FullPageLoader)
  features/   one folder per feature, each with its own components/ and pages/
    auth/       session state, RequireAuth and PublicOnly (the route guards), the login page
    directory/  the employee directory (a placeholder for now)
  layouts/    frames around screens (AppShell: top bar, who is signed in, sign out)
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

In development Vite forwards `/api/*` to the backend (`http://localhost:3000`, change it
with `DEV_API_URL`), so the browser only ever talks to one origin. The proxy also rewrites
the refresh cookie's path from `/auth` to `/api/auth`: the API scopes that cookie to
`/auth`, and the browser would otherwise not send it to `/api/auth/refresh`.

Environment variables are listed in `.env.example`.

## CI and deploy

- `.github/workflows/frontend-ci.yml` runs lint, format check, tests and build on every
  push to `main` and every pull request that touches `frontend/`.
- `.github/workflows/frontend-deploy-pages.yml` publishes the site to GitHub Pages. It is
  started by hand from the Actions tab. Setup: Settings > Pages > Source = "GitHub
  Actions", and a repository variable `VITE_API_URL` with the API's full URL.

**Caveat for Pages:** the site (`<user>.github.io`) and the API are different sites, so the
refresh cookie becomes a third-party cookie, which Safari and some other browsers block.
Behind a host that proxies `/api/*` to the API (such as Vercel) it stays first-party. In
production that proxy also needs the cookie path fixed, which the API does not support yet
(see `docs/plan.md`, M9).
