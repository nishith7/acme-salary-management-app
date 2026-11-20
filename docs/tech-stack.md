# Tech Stack & Key Technical Decisions

**Status:** accepted · **Date:** 18 Nov 2026 · Requirements: [requirements.md](requirements.md)

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) in both packages |
| API | NestJS 12 (ESM), REST, Swagger/OpenAPI; request validation with Zod through Nest's `StandardSchemaValidationPipe`; one schema gives validation, types and the Swagger document (confirmed by the login endpoint's Swagger tests) |
| Database | PostgreSQL 16 with Prisma (migrations + typed client) |
| Auth | Short-lived JWT access token + rotating opaque refresh token (httpOnly cookie), argon2id passwords, global guard with `@Public()` opt-outs, `HR_ADMIN` role guard, ownership checks in the service layer |
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
10. **Access JWT plus rotating refresh token.** A 15-minute JWT is checked without touching the database. A 7-day opaque refresh token is stored only as a SHA-256 hash, rotated on every use, and a replayed token revokes its whole family. It travels in an httpOnly cookie so scripts cannot read it. *Cost:* an access token cannot be revoked before it expires, and a cookie needs the UI and API to share an origin (see [architecture.md](architecture.md) section 5). A plain long-lived JWT would be simpler, but one leaked token would be valid for days with no way to cut it off.
11. **argon2id for passwords.** OWASP's first choice, and it resists GPU cracking better than bcrypt. *Cost:* a native module, so the Render build must be checked.
12. **Repositories wrap Prisma, and stay thin.** Services never call Prisma directly. Each module has a repository class that owns its queries (`UsersRepository`, `RefreshTokensRepository`). Reasons:
    - **Fast, deterministic service tests.** A service test hands the service a fake repository (`{ findByEmail: vi.fn() }`), so it needs no database and no knowledge of how Prisma's calls are shaped. The `AuthService` unit tests work this way.
    - **One home for the hard queries.** The percentile insights and the filtered, paginated directory over 10,000 rows are raw SQL or complex Prisma calls. In a repository they sit in one place, and integration tests run them against the real database.
    - **Atomic writes.** An interactive transaction needs the Prisma client, which services never touch. So a step that must be all-or-nothing is one repository method: `RefreshTokensRepository.rotate` retires the old refresh token and stores its replacement in one transaction, and returns false if the token was already retired. The rule about what that means (a replay, so revoke the family) stays in `AuthService`. The integration tests run these methods on a rolled-back transaction, where `$transaction` joins the surrounding one.

    *Cost:* Prisma Client is already typed, so a simple method such as `findByEmail` is a one-line pass-through. Repositories also return Prisma's generated types, not separate domain classes, so services stay coupled to those types. Both are accepted: separate entity classes and mappers would double the model code for no gain at this size. *Rules that keep it cheap:* a repository holds queries and no business rules; there is no generic `BaseRepository<T>`, which would hide Prisma's typed API; a method is added only when a service needs it.

13. **Seed data from faker, with the shape decided by us.** `@faker-js/faker` (pinned to an exact version, a dev dependency used only by `npm run seed`) supplies the random choices and the names, in each country's own locale. What makes the data useful is not random rows but their structure, which is plain data in `src/seed/reference-data.ts`: country, department and level weights, a job title ladder per department, tenure that rises with level, about 6% leavers, and fewer women in engineering and at senior levels. *Costs:* faker's output for a given seed can change between versions, so the version is pinned and bumping it changes the dataset (a first version of the seed used hand-written name lists and a tiny random generator of its own, which cannot drift; the author asked for faker, which gives more varied, realistic names for 15 locales for free). Faker has no Latin-script option for Japan, the UAE or Singapore, so those countries get names in their own script, and a search typed in Latin letters will not find them; changing a country's locale is a one-line edit.

14. **Salary history from a stated pay model, one random source per employee.** The seeded pay comes from a model in plain data (`src/seed/pay-model.ts`: a US ladder by level, times a country pay index, a department factor and a fixed illustrative exchange rate, to 3 significant figures), so the numbers are arguable and every insight can be checked by hand. Today's salary is made first and the history is built backwards from it, so the current pay is exactly the model's. Each employee's history is drawn from a small seeded generator keyed by the seed and the employee code (`src/seed/random.ts`), not from faker or from one shared stream. Reasons: (1) the 10,000 employees already stored must not change, and a shared stream would shift every employee after the first difference; (2) the history of one person never depends on who else was generated, so it can be rebuilt for any stored employee and a test can prove it; (3) a faker upgrade cannot change the salaries. *Costs:* a 20-line generator of our own to trust (mulberry32 with a murmur3-style key mix; tests check its spread and that neighbouring keys do not correlate), and amounts are whole currency units rounded to 4 significant figures, which is coarser than real pay but exact (money is never a float in the database). The seed only reads stored employees and inserts for those with no record, scoped to the numbered `EMP-` set, so it never invents pay for an employee created later in the app.

## Deliberately not chosen

- **Docker Compose** — the app is reviewed through the hosted URL and demo video, not run locally.
- **Microservices, message queues, caching layers** — unnecessary at 10k rows; they would add moving parts without changing the user's outcome.
- **An LLM feature** — not required by the brief; salary data is sensitive and should not be sent to a third party in v1.
