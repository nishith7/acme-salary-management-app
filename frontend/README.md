# ACME Salary Management: frontend

React 19 + Vite 8 + TypeScript. The UI library is Material UI (see `docs/tech-stack.md`,
decision 15); it is not installed yet, so this package is the toolchain only.

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
