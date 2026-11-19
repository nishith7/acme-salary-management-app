# AI Log

How AI was used on this project, including where it was wrong or was overruled. Standing instructions given to the AI tool are in [CLAUDE.md](../CLAUDE.md).

## How AI is used here

- **Tool:** Claude Code (Claude Sonnet 5.5) inside VS Code.
- **Working agreement:** the AI proposes, the author decides. Every claim is checked by running something (build, tests, a real connection) before it is committed. Generated files are read before they are kept.
- **Scope control:** the assessment brief and the requirements doc are saved as persistent context for the tool, so suggestions stay in scope.

## Entries

Each entry: what was asked, what the AI produced, what the author decided or corrected, and the outcome.

### 1. Repo bootstrap (18 Nov 2026)

- **Asked:** make the first commit with `docs/requirements.md`, an empty `docs/AI_LOG.md` and a one-line README. `requirements.md` was written before the coding session, as the brief asks for requirements before building.
- **AI:** committed those files. The author then asked whether `.gitignore`, Husky and similar belong in the first commit.
- **Decision:** add stack-independent config now (`.gitignore`, `.gitattributes`, `.editorconfig`). Husky, commitlint and CI wait until there is a `package.json` and real scripts for them to call.
- **Outcome:** first commit contains six files.

### 2. Git identity and push (18 Nov 2026)

- **Problem:** commits used the author's company git identity, and the first push returned 403 because a cached company credential was sent to GitHub.
- **AI:** explained the cause, did not delete the cached credential (company repos depend on it), and instead pinned the personal username in the remote URL.
- **Decision:** the author set a repo-local personal identity and pushed from their own terminal, since sign-in needs a browser.
- **Outcome:** push works; the first commit was re-authored before it was pushed.

### 3. Scope and hosting review (18 Nov 2026)

- **AI:** compared the assessment brief with `requirements.md` and flagged that 11 features may be too much for a take-home, and that the live-deployment requirement affects the database choice.
- **Decision:** priorities in `requirements.md` already separate Must from Should and Could. The plan builds F1–F7 first and cuts F8–F11 first (see [plan.md](plan.md)). Postgres stays because `percentile_cont` keeps the insights in the database.

### 4. Docker Compose proposed, then dropped (18 Nov 2026)

- **AI:** proposed a Postgres `docker-compose.yml` so reviewers could run the app locally.
- **Correction by author:** reviewers will not run the app; they will use the hosted URL and the demo video.
- **Outcome:** Docker Compose dropped. Local development uses Neon directly, and CI will use a GitHub Actions Postgres service container.

### 5. Stack decision (18 Nov 2026)

- **Asked:** read the job posting and decide the stack; the author required NestJS, React and Postgres.
- **AI:** the posting page loaded its text with JavaScript, so the description was extracted from the page's embedded data. It is a TypeScript role that values TDD, CI/CD, relational databases and performance. The AI proposed TypeScript end to end with React on Vite rather than Next.js, because the API is a separate service.
- **Repo layout:** the author first said "this is just backend repo", then asked whether two folders would complicate deployment. The AI explained that Render and Vercel both support a root-directory setting and recommended one repo with `backend/` and `frontend/`, for one submission link and one commit history. Author approved.
- **Outcome:** recorded in [tech-stack.md](tech-stack.md).

### 6. Nest scaffold: AI assumption corrected (18 Nov 2026)

- **AI error:** the first tech-stack doc said Jest and ESLint, from the AI's prior knowledge.
- **Found by:** running the scaffold. Nest 12 generates Vitest and oxlint, and an ESM project.
- **Fix:** the doc was corrected to the framework defaults, which also means one test runner across both packages.
- **Untrusted generated content:** the scaffold also wrote an `AGENTS.md` telling agents to install vendor telemetry and add a vendor MCP server. Nobody asked for that, so it was not followed and the file was removed. The useful framework notes (ESM import rules, `vi.fn()`) were kept in `CLAUDE.md`.
- **Author interventions:** rejected an attempt to scaffold the frontend in the same step ("first let's complete backend").

### 7. Neon and Prisma connection (18 Nov 2026)

- **Given:** the author supplied Neon's connection string and Neon's example snippet.
- **AI decisions:**
  - Did not use the snippet's serverless HTTP driver, which targets edge runtimes. Used Prisma with the standard `pg` driver, since the API is a long-running server.
  - Split the config into a pooled URL for the running API and a direct URL for migrations.
  - `npm install -D prisma` installed an 8.0 release candidate because npm's `latest` tag points at one, while the client was 7.10.1. Caught from the version output and pinned all three packages to 7.10.1.
  - `prisma init` silently added about 80 third-party AI "skills" files in three agent folders. They were reviewed and removed, and the stray `prisma7.config.ts` was renamed to `prisma.config.ts`.
- **Verification:** connected to the real database through both URLs and through the Prisma CLI (PostgreSQL 16.16), without printing credentials.
- **Security:** the password was pasted into the chat. It was kept only in the gitignored `.env`, the staged diff was scanned for secrets before committing, and the author was advised to reset the Neon password.

### 8. Documentation artifacts (19 Nov 2026)

- **Asked:** make sure the artifacts the brief requires are all present.
- **AI:** audited what existed, then wrote the missing pieces: [architecture.md](architecture.md) (diagrams), [plan.md](plan.md), [performance.md](performance.md), [CLAUDE.md](../CLAUDE.md), and this log. Performance numbers are marked TBD rather than invented, and the data model is labelled proposed until the schema migration lands.

### 9. Database wiring and health endpoints, test-first (19 Nov 2026)

- **Asked:** continue with the Nest-side database connection.
- **AI:** wrote the specs for environment validation and the health service first and confirmed they failed (module not found), then implemented until green.
- **Design decisions made by the AI, for the author to review:**
  - Two endpoints instead of one. `/health` never touches the database; `/health/ready` does. A platform health check that queried the database every few seconds would keep Neon awake and use up free-tier compute.
  - The Prisma client is generated into `src/generated/prisma`, not the `../generated/prisma` that `prisma init` suggested, because `nest build` compiles only `src/`.
  - The database connection is lazy, so a sleeping database never blocks startup.
  - Environment validation and the readiness error never include connection strings or driver errors; both have a test for that.
  - Removed the scaffold's "Hello World" controller and its tests rather than keeping dead code.
- **Verified by running it:** 12 unit tests, 3 e2e tests (with a fake database), lint and build pass. The compiled app was then started against the real Neon database: `/health` returned 200 and `/health/ready` returned 200 with `database: up`. A fresh `npm install` regenerates the client through `postinstall`.

### 10. Swagger and API documentation, test-first (19 Nov 2026)

- **Asked:** set up Swagger and document the health endpoints with it.
- **AI:** wrote a Swagger e2e spec first (UI served at `/docs`; the OpenAPI document lists both health routes with their status codes and response schemas) and confirmed it failed. Then implemented it.
- **Design decisions made by the AI, for the author to review:**
  - App-wide setup moved into `configureApp` in `src/app.setup.ts`, and e2e tests get a shared `createTestApp()` that calls it. Tests therefore exercise the same setup as production, and later additions (validation pipe, prefixes) are covered automatically.
  - Response bodies are DTO classes with `@ApiProperty`, and the service builds its error body from the same DTO type, so the documentation and the runtime response cannot drift apart silently.
  - Swagger is on in every environment on purpose, so reviewers can explore the deployed API. Authentication will be added to the document when auth is built.
- **Verification:** the IDE reported errors for imports that no longer existed. The real compiler was run instead of trusting it: unit (12), e2e (8), lint and build all pass. The compiled app was then started and `/docs` and `/docs-json` fetched.

### 11. Database schema, one table at a time (19 Nov 2026)

- **AI error (pace):** the AI wrote a 10-table schema in one go, and planned to hand-edit migration SQL to add CHECK constraints. The author stopped it: they expected migrations to be generated from the model, and wanted one table at a time with the columns reviewed first.
- **Fix:** the draft was archived outside the repo. The generated migration was deleted only after confirming the database had no applied migrations, and the schema was cut back to the `User` table. The columns were reviewed and approved (UUID id, `name` kept, email lowercased by the app) before any migration was generated.
- **Process now:** model one table, review its columns, write the integration test first (4 tests failing against the real database), have Prisma generate the migration, review the SQL, apply it, see the tests pass.
- **Prisma versions:** the author had read the Prisma 8 docs, where a "contract" is the source of truth and migrations are TypeScript. The AI read those docs, explained that the pinned 7.10.1 works differently (`schema.prisma` produces SQL migrations and the client), said it only had a summary of version 8 and would not guess its commands, and recommended staying on the stable version. The author chose to stay on 7.10.1.
- **Wrong-directory incident:** `npx prisma` run from the repo root, outside `backend/`, downloaded the 8.0 release candidate instead of the pinned CLI. Nothing was changed. The rule to run Prisma from `backend/` is now in `CLAUDE.md`.
- **Observation:** after the migration, a `playing_with_neon` table appeared in the database. This project did not create it (the name matches Neon's console sample table), so it was left alone.
- **Verified:** 4 integration tests pass in rolled-back transactions; unit (12), e2e (8), lint and build still pass.

### 12. The `countries` table, and a drift stop (19 Nov 2026)

- **Process:** the AI showed the proposed columns first (UUID id, `code` char(2) unique, `name`, `currency_code` char(3); no timestamps because it is seed-managed reference data) and listed four decisions. The author approved, then the AI wrote 5 integration tests and watched all 5 fail before adding the model.
- **Stop:** `prisma migrate dev --create-only` reported drift, caused by the `playing_with_neon` table noted in entry 11, and offered to reset the `public` schema. The AI did not accept the reset. It confirmed the database was unchanged, read the table read-only (3 columns, 10 rows), and gave the author two options: drop the table, or declare it external in `prisma.config.ts` (a Preview feature, per the version 7 docs). It recommended dropping it and did not drop it itself, because the table was not created by this project.
- **Decision:** the author dropped the table. Dropping a table the project never created was the author's call, not the AI's.
- **Outcome:** Prisma generated the migration, the SQL matched the reviewed design, it was applied, and the tests passed. Unit (12), e2e (8), integration (9), lint and build pass; the tests left no rows behind.
- **Rule added:** `CLAUDE.md` now says never to accept a `migrate reset` offer on this database, and to stop and ask.

### 13. The `departments` table (19 Nov 2026)

- **Process:** the same loop with no surprises: columns shown and approved (uuid id, `name` text unique, no timestamps), 3 integration tests written first and seen failing, Prisma generated the migration with `--create-only`, the SQL was read and matched the design, then it was applied. With the stray table gone there was no drift.
- **Verified:** unit (12), e2e (8), integration (12), lint and build pass. The database now holds `users`, `countries`, `departments` and Prisma's own ledger table, and 3 applied migrations.

### 14. Auth design and the `refresh_tokens` table (19 Nov 2026)

- **Asked:** start the auth module with a refresh-token strategy, "whichever is best practice".
- **Sequencing:** the author asked whether to build login or finish the whole schema first. The AI recommended login first, because `users` already exists, the remaining tables serve features that are not built yet, and a global guard is cheaper to add before the other endpoints exist. It named the cost: the risky parts (10k rows, percentile insights) wait one step longer. `plan.md` was reordered to match.
- **Checked before recommending:** rather than rely on memory, the AI read the installed packages. Nest 12 ships a `StandardSchemaValidationPipe`, and `@nestjs/swagger` 12 can document Standard Schema (Zod) parameters. `@nestjs/jwt` 12 and `@nestjs/throttler` support Nest 12. The Zod choice is therefore provisional until a failing-first Swagger test proves it, and class-validator is the stated fallback.
- **Design:** 15-minute access JWT; opaque 7-day refresh token stored as a SHA-256 hash, rotated on use, with family revocation on reuse; httpOnly cookie delivery. It was proposed with its costs (no early revocation of an access token, parallel refreshes look like reuse, no absolute session cap) and recorded in [architecture.md](architecture.md) section 5 with a threat table and a sequence diagram.
- **Deployment catch flagged early:** the UI (Vercel) and API (Render) are different sites, so a cross-site cookie would silently fail in some browsers. The plan is a Vercel proxy for `/api/*`, to be verified at deploy time. It is recorded as an assumption, not a fact.
- **Process:** columns shown and approved first. 7 integration tests were written and seen failing, Prisma generated the migration, the SQL was read and matched, then it was applied.
- **Verified:** unit (12), e2e (8), integration (19), lint and build pass; the diagrams parse with the mermaid parser.

### 15. Login endpoint and the Zod/Swagger decision (19 Nov 2026)

- **Asked:** continue with the auth build order: packages, the Zod and Swagger check, then the endpoints.
- **Packages:** installed with exact versions. `argon2` hashed and verified on the author's Windows machine. `npm audit` reported 5 issues, so the AI traced them instead of ignoring or "fixing" them: all come from `@nestjs/mau`, a dev-only tool from the Nest scaffold, and `npm audit --omit=dev` reports 0. `npm audit fix --force` was not run.
- **Zod and Swagger, decided by evidence:** the AI read the installed Nest 12 and Swagger 12 code and found that Swagger asks a Standard Schema for its own JSON Schema, which Zod 4.6.7 provides. The login e2e tests, written first, then proved it: the OpenAPI document shows the request body (required fields, email format, password length) and the 200 response, all generated from the Zod schemas. class-validator is not needed.
- **Pre-existing defect found:** the e2e tests only passed because the author's local `.env` supplied `DATABASE_URL` while `app.module.ts` was being imported; the config module validates at import time, before `createTestApp()` could set anything. They would have failed on a clean CI machine. Fixed at the root: placeholder values are set in `vitest.config.e2e.ts`, and a rule was added to `CLAUDE.md`.
- **Decisions made by the AI, for the author to review:**
  - argon2id at the OWASP minimum cost (19 MiB, 2 passes, 1 lane), not the library default (64 MiB, 4 lanes), so a few simultaneous logins cannot exhaust a small free-tier instance.
  - For an unknown email the service still runs a full verification against a throwaway hash, so timing does not reveal which accounts exist. A unit test asserts the verification happens.
  - Wrong password and unknown email return the same 401 message; the 400 error never echoes the submitted password (tested).
  - The refresh token is only ever in the cookie, never in the response body (tested).
- **Deferred on purpose:** the login rate limit. Behind Vercel and Render every request comes from a proxy, so a per-IP limit without a trusted-proxy setting would count everyone as one client and lock all users out. It will be built together with that setting.
- **Process note:** the unit and e2e tests were written and seen failing before the code. The integration tests (real database, rolled back) were written after the implementation and passed on the first run, so they show the behaviour but were not seen failing.
- **Verified:** unit (46), e2e (26), integration (25), lint, build and a full type-check including the test files pass. The compiled app was started against the real database: `/health` returned 200, login with an unknown email returned the generic 401, a bad body returned 400, and `/docs-json` shows the login operation. Prettier was run on the files touched; two older files (`health.service.ts`, `main.ts`) already failed `prettier --check` and were left alone.

### 16. Refresh endpoint, rotation and reuse detection (19 Nov 2026)

- **Asked:** build `POST /auth/refresh`, the next step of the agreed auth order.
- **Design decisions made by the AI, for the author to review:**
  - A refresh token works once. Using it retires it and issues its replacement in the same family. Presenting a token that was already used revokes the whole family, because the real owner and a thief cannot be told apart.
  - The old token is retired with a conditional update (`WHERE revoked_at IS NULL`) inside a transaction with the insert of the new one. That makes two simultaneous requests with the same token resolve to exactly one winner, and it means a failure cannot leave the user with no token or two.
  - The transaction is a repository method (`rotate`), not a service-level transaction: services never touch Prisma, and an interactive transaction needs the client. This changed a sentence in decision 12 and a `CLAUDE.md` rule, both updated in the same commit.
  - The user is re-read on refresh, so a changed role reaches the next access token. The cookie is cleared on every 401 from this endpoint, and all failures share one message.
  - The cookie value is only accepted if it is a string: `cookie-parser` turns a value starting with `j:` into an object.
- **Verified against the real database, not just mocks:**
  - Two simultaneous refreshes with one token, on a warmed connection pool: one succeeded, the other blocked on the row lock, found the token already retired, got a 401 and revoked the family. Final state: 2 rows, both revoked.
  - Consequence, now documented: the winner's new token is revoked too, so its next refresh fails. This is the accepted "parallel refreshes look like reuse" trade-off. The UI must refresh through a single in-flight request.
- **A mistake corrected in this step:** the first real-concurrency run also showed "one fulfilled, one rejected" and I took it as proof the guard works. Instrumenting the run showed the loser had not lost through the guard at all: it failed with Prisma's "unable to start a transaction in the given time" (2 s default), because it had to open a second new connection to Neon from a laptop. Only the second run, with a warmed pool, exercised the real race. Lesson: look at why something failed before calling it a pass. The first failure mode is itself worth knowing: with a cold pool and slow network, a second simultaneous refresh can return 500 and consumes nothing, so a retry is safe.
- **Process notes:**
  - Unit and e2e tests were written first and seen failing (24 and 11 failures before the code, then 2 more for the Swagger document).
  - The integration tests were written before the code too, but did not fail: `$transaction` on a rolled-back transaction client exists at runtime and joins the surrounding transaction (checked with a probe: same connection and transaction id), so they ran against the real implementation. To show they were not vacuous, two rules were removed from the repository temporarily and the tests that guard them failed (the conditional retire and the active-only family revoke); both were restored.
  - The probe and concurrency scripts were throwaway files, deleted after use. The concurrency probe wrote one real test user to the dev database and deleted it, which cascaded to its tokens; 0 rows were left.
- **Verified:** unit (78), e2e (39), integration (39), lint, build and a type-check including the tests pass. `health.service.ts` and `main.ts` still fail `prettier --check`, as before this work.
