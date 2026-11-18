# Tech Stack & Key Technical Decisions

**Status:** accepted · **Date:** 18 Nov 2026 · Requirements: [requirements.md](requirements.md)

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) in both packages |
| API | NestJS 12 (ESM), REST, Swagger/OpenAPI; request-validation library chosen with the first endpoint |
| Database | PostgreSQL 16 with Prisma (migrations + typed client) |
| Auth | JWT, `HR_ADMIN` role guard, ownership checks in the service layer |
| UI | React + Vite, shadcn/ui + Tailwind, TanStack Table + Query, Recharts |
| Tests | Vitest in both packages: + Supertest for the API, + Testing Library for the UI |
| Quality | oxlint (Nest 12 default) for the API, ESLint for the UI, Prettier, Husky + lint-staged, commitlint, GitHub Actions |
| Hosting | Neon (Postgres), Render (API), Vercel (UI) |

## Decisions and trade-offs

1. **Postgres, not SQLite.** The insights (median / P25 / P75 by country, department, level) need `percentile_cont` and window functions so aggregation stays in the database (requirements §5). It also gives exact `NUMERIC` for money and safe concurrent bulk updates. *Cost:* a hosted database is needed for deployment (Neon free tier).
2. **Prisma, with raw SQL where it must.** Prisma gives typed queries and migrations; percentile aggregations go through `$queryRaw`. *Cost:* those queries lose some type safety, so they live in one repository class and are covered by integration tests.
3. **Money is `Decimal`, never float.** Salaries are stored in local currency; USD comparisons use a dated exchange-rate table so numbers are reproducible.
4. **Layered modules: controller → service → repository.** Controllers handle HTTP and validation, services hold business rules and authorisation, repositories own Prisma. Domain rules (tenure band, compa-ratio, annualised growth, band checks) are pure functions, so most unit tests need no database and run in milliseconds.
5. **REST, not GraphQL.** The screens map to a small, known set of queries; REST plus Swagger is simpler to document, test and cache.
6. **React + Vite, not Next.js.** The API is a separate NestJS service, so server-side rendering adds nothing. A static SPA is simpler to build and host. TanStack Table handles server-side pagination, sorting and filtering of 10k rows.
7. **One repo, two independent packages** (`backend/`, `frontend/`, no npm workspaces). One link to submit and one commit history covering API and UI together. Each folder deploys on its own via the host's root-directory setting.
8. **Test strategy.** Many fast unit tests (pure domain logic, services with mocked repositories); a few integration tests against real Postgres for migrations, raw SQL and pagination; component tests for the UI. Domain logic is written test-first. CI runs everything on each push using a Postgres service container.
9. **Performance is measured, not assumed.** Targets are < 500 ms for the directory and < 1 s for insights at 10k employees. They will be checked against the 10k seed with `EXPLAIN`, and indexes added only where the plan shows a need.

## Deliberately not chosen

- **Docker Compose** — the app is reviewed through the hosted URL and demo video, not run locally.
- **Microservices, message queues, caching layers** — unnecessary at 10k rows; they would add moving parts without changing the user's outcome.
- **An LLM feature** — not required by the brief; salary data is sensitive and should not be sent to a third party in v1.
