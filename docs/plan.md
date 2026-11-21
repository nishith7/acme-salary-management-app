# Delivery Plan & Design Notes

**Status:** living document, updated as slices land. Priorities (Must / Should / Could) and feature numbers (F1–F9) come from [requirements.md](requirements.md).

## 1. Approach

- **Vertical slices, test-first.** Each slice is a small, working piece of behaviour (data model, then API, then UI) with fast deterministic tests, committed on its own.
- **Tables arrive with the feature that needs them,** one table at a time, each reviewed and migrated on its own. The only table left, `imports`, is designed next to the import feature that uses it, not guessed at up front.
- **Backend first, then frontend, then deploy.** The API and data model are the riskiest part, so they are built and tested before the UI depends on them.
- **Must before anything else.** F1–F7 are the product. F8 and F9 (Should) are built only if time remains; they are cut first.
- **Definition of done for a slice:** lint, unit tests and build pass; docs touched if a decision changed; a short entry added to [AI_LOG.md](AI_LOG.md) when AI made a notable contribution or needed correction; committed with a Conventional Commit message.

## 2. Milestones

| # | Milestone | Covers | Status |
|---|---|---|---|
| M0 | Foundations: requirements, tech stack, Nest scaffold, Neon + Prisma connection, health endpoints | all | done |
| M1 | Data model foundations: `users`, `countries`, `departments` | all | done |
| M2 | Auth: login, refresh-token rotation, logout, JWT and `HR_ADMIN` role guards, `GET /auth/me`, login rate limit | §3 | done. No admin seed: the author creates the HR manager by hand (steps in `backend/README.md`) |
| M3 | `employees` and `salary_records` tables, the 10,000-employee seed (realistic pay by country, level, department), employee directory with search, filters, pagination (backend) | F1, F2 | in progress: `employees` table and the 10,000-employee seed (`npm run seed`) done; `salary_records` table done (columns reviewed first); salary history in the seed done (59,077 records: a hire record per person, then merit raises, promotions, market adjustments and a few corrections, built backwards from a stated pay model); next: the directory (current salary: lateral join or a pointer, decided with `EXPLAIN`) |
| M4 | Employee profile and salary changes, `salary_bands`, add/edit/terminate | F3, F4 | in progress, in four slices: (1) the read-only profile, `GET /employees/:id` and the panel over the directory, **done**; (2) record a salary change (`POST /employees/:id/salary-changes` and the Edit salary form), **done**; (3) add, edit and terminate an employee: **dropped by the author** (21 Nov 2026, reasoning in `requirements.md` section 4); (4) maintain salary bands, not scheduled yet |
| M5 | Pay insights with the privacy threshold (groups under 5 hidden) | F5 | planned |
| M6 | Export of the current view (F7), then bulk salary update from a spreadsheet (F6: template, validation preview, repeatable commit, an `imports` table so every change traces to its upload); the rule-based bulk raise (F8) after that | F6, F7, F8 | export (F7) and bulk update by upload (F6) done (decisions 21 and 22, the `imports` table); next: what is left of M4 (salary bands) and the pay insights (M5) |
| M7 | CI pipeline and quality tooling (Husky, lint-staged, commitlint, GitHub Actions) | quality | planned |
| M8 | Frontend: directory, profile, insights, import | F1–F8 UI | started early (the author chose to begin the frontend before finishing M4-M6): `frontend/` toolchain done (React 19, Vite 8, Vitest, Oxlint, Prettier), a CI workflow and a manual GitHub Pages deploy workflow; UI library chosen by the author: Material UI (`tech-stack.md` decision 15); MUI, the DataGrid (server mode, decided), react-router and TanStack Query installed; API client done (`frontend/src/api/`: one axios instance, token in memory, one shared silent refresh); theme (palette and Mulish font chosen from the login design), sign-in page, session restore, protected routes and sign-out done (`docs/tech-stack.md` decision 17); employee table done (ten columns, server paging of 25, 50 or 100, sorting, loading, empty and error states; decision 18), checked in a real browser against a mock API; search and filters done (name or ID search, country and department multi-selects fed by `GET /employees/filter-options`, an All/Active/Left control; decision 18), tested but not yet looked at in a browser; the employee profile panel done (read-only, decision 19); recording a salary change done (the Edit salary form, decision 20); the Export CSV button done (decision 21); the Bulk update page (template, upload, preview, apply) done; next: the pay insights (M5), the summary cards last |
| M9 | Deploy (Neon, Render, Vercel), demo video, README polish. Deploy checklist: set `JWT_SECRET`, set `TRUST_PROXY` and verify it with the two-network check in `backend/README.md`, confirm the Vercel `/api/*` proxy keeps the refresh cookie first-party, **and make the refresh cookie's path match the proxied path**: the API sets `Path=/auth`, so behind `/api/*` the browser never sends it to `/api/auth/refresh` (development no longer uses a proxy: the browser calls the API directly and the backend allows the frontend through `CORS_ORIGINS`, and the cookie keeps its `/auth` path; production needs one of a configurable path in the API behind a path-prefixing proxy, the site and the API under one site such as `app.example.com` and `api.example.com`, or a cookie with `SameSite=None; Secure`). The strict cookie is not sent between different sites, so direct calls from Vercel or Pages to Render would log every reload out: this must be settled before deploying. GitHub Pages cannot proxy, so there the cookie would be third-party | readiness | planned |
| M10 | Stretch, if time: increment tracking. F8 (bulk salary change) is the first thing cut from M6 | F9 | cut first |

## 3. Design notes

- **System of record, not payroll.** Salary changes append effective-dated history; nothing is overwritten. See [architecture.md](architecture.md) for the data model. Paying people (payroll execution, pay status, payslips) is deliberately out of scope: see [requirements.md](requirements.md) §4 for the reasoning.
- **The spreadsheet is the front door.** The HR Manager's data starts in Excel, so import (F6) is a core feature, not a convenience: it loads the 10,000 employees, it is repeatable, and every change it makes traces back to its upload. The seed also writes the same people as an Excel file, which stands in for ACME's real spreadsheet and is what the demo uploads.
- **Privacy by default.** Insight endpoints return no segment with fewer than 5 people, so an individual cannot be inferred.
- **Realistic seed data.** Insights are only meaningful if the seed is: salaries are generated per country and level with a spread, some employees sit outside their band, both genders are represented, and the seed is deterministic (fixed random seed) so runs are reproducible. The employee half is built: 10,000 people from faker (pinned), shaped like a multinational: 15 countries with a few big offices, engineering as the largest department, a pyramid of seven levels, about 6% who have left, fewer women in engineering and at senior levels so the gender insight has something to find, and a handful of small country and level groups under the privacy threshold so that rule is visible. The salary half is built too: a pay model (US ladder x country index x department factor x a fixed exchange rate), a bell-shaped spread, women about 4% lower at the same country, level and department, about 7% of people clearly outside a band of 15% either side of the midpoint, and a history of raises that never cuts pay (see tech-stack decision 14).
- **Authorisation in services.** Ownership checks sit in the service layer from day one, so the later `EMPLOYEE` role is additive.

## 4. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Scope too large for the time available | Must-first order above; F8 and F9 are explicitly cut first |
| Free-tier cold starts hurt the demo | Warm the API and database before recording; documented in the README |
| Insights look meaningless on random data | Structured, deterministic seed (see section 3) |
| Percentile SQL is less type-safe through Prisma | One repository class for raw SQL, covered by integration tests against real Postgres |
| Time lost on tooling | Use framework defaults (Nest 12: Vitest, oxlint) rather than hand-rolled setups |

## 5. Open decisions

Decided when the first related code is written, then recorded in [tech-stack.md](tech-stack.md) or [performance.md](performance.md):

- Current-salary derivation, pagination style, name-search indexing (see performance.md §3).
- Where the auth token is stored in the browser.
- Import and export formats: `.xlsx` and `.csv` for import, CSV (and possibly XLSX) for export. Which Excel library to use is decided when M6 starts, with the package's maintenance and security record in mind.
