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

### 17. Logout endpoint (19 Nov 2026)

- **Asked:** build `POST /auth/logout`, the next step of the agreed auth order. While the author was reviewing, they asked what `GET /auth/me` is for. The AI said plainly that it is optional, because login and refresh already return the user, and recommended keeping it only as the first protected route for the guard. The author kept it, so it is now planned right after the guard.
- **Design decisions made by the AI, for the author to review:**
  - Logout reads only the refresh cookie, not the access token. It therefore works after the access token has expired, which is exactly when a user is most likely to click it.
  - It always returns 204 and clears the cookie, even with no cookie, an unknown token or a repeated call. Failing would give a user stuck with a bad cookie no way out, and would tell an attacker whether a token exists.
  - It revokes the whole family, even when the token it was given was already used or expired, because the user can be holding an older token while a newer one is still live.
  - It ends one login session only. "Log out everywhere" is not built and is not in the requirements.
  - If the database call fails, the cookie is not cleared and the request fails, so the UI knows the logout did not happen and can retry.
- **A constraint passed forward:** when the global JWT guard arrives, logout must be marked `@Public()`. An e2e test sends it a garbage `Authorization` header and expects 204, so forgetting that fails a test instead of breaking logout for expired sessions.
- **Process:** tests were written first and seen failing at all three levels (6 unit, 9 e2e including Swagger, 4 integration) before any code. The cookie-clearing helper from the refresh step was reused, and the cookie-cleared assertion moved to module scope so both endpoints' tests share it.
- **Verified:** unit (84), e2e (48), integration (43), lint, build and a type-check including the tests pass. `health.service.ts` and `main.ts` still fail `prettier --check`, as before this work.

### 18. Global JWT and role guards, `GET /auth/me` and Swagger bearer auth (19 Nov 2026)

- **Asked:** build the global guard with `@Public()`, the role guard and Swagger bearer auth. `GET /auth/me` was kept earlier and is built here as the first protected route.
- **Design decisions made by the AI, for the author to review:**
  - Secure by default: the guard is registered for the whole app, so a forgotten decorator means "needs a token", not "open".
  - The token is checked from its signature alone, with no database call. The algorithm is pinned to HS256, and `exp`, a UUID `sub` and a known `role` are all required, so a validly signed but oddly shaped token is refused. Every failure returns the same 401 message.
  - A route with no `@Roles` is open to any signed-in user, not only to `HR_ADMIN`, because `/auth/me` has to work for every role. The cost: an HR controller that forgets `@Roles('HR_ADMIN')` would be open to an `EMPLOYEE` once that role has users. Mitigation: a `CLAUDE.md` rule, and each HR controller's e2e tests must show an `EMPLOYEE` token gets 403. `@Roles()` with no roles does not compile, so it cannot silently mean "everyone".
  - `RolesGuard` fails closed: if a role is required and there is no user, it is a 403.
  - Logout is `@Public()`, as the previous step's test required. The Swagger pages are served outside Nest's routing, so the guard never sees them (an e2e test checks both load without a token).
  - `GET /auth/me` returns the user from the database, not from the token, so it always shows the current role.
- **Test-only controller:** no real route is role-restricted yet, so the e2e tests add a probe controller through `createTestApp({ controllers })`. The global guards apply to it exactly as to real controllers, which proves the registration rather than only the guard logic.
- **Checking that the tests have teeth:** three mutations were applied and all were caught, then reverted (the guard file was diffed against a backup):
  - Removing the algorithm pin fails the HS512 test.
  - Making `exp` optional fails the no-expiry test.
  - Swapping the order of the two global guards fails two e2e tests, including "401, not 403 when there is no token". This also confirmed an assumption I had not verified: providers registered with `APP_GUARD` run in declaration order.
- **Process:** unit and e2e tests were written first and seen failing (missing modules, `service.me is not a function`, 10 e2e failures plus a guard spec that could not load). Everything passed on the first run after implementing.
- **A smoke-test slip, corrected:** my first run of the compiled app used the wrong path (`dist/src/main.js`; it is `dist/main.js`), so it never started, but port 3999 already had a server answering `/health` with 200 and 404 for `/auth/*`. I noticed the 404s did not match the code and investigated rather than reading the output as a result. It is an old `node dist/main` from 00:31 today, from a build older than login and Swagger. I could not prove it was mine, so I did not kill it and used port 4010 instead. It is still running and the author may want to stop it. On the right path and port the compiled app behaved as expected: public routes open, `/auth/me` 401 without a token, the bearer scheme in the OpenAPI document, no dependency-injection errors.
- **Verified:** unit (116), e2e (80), integration (43), lint, build and a type-check including the tests pass. `health.service.ts` and `main.ts` still fail `prettier --check`, as before this work.

### 19. Login rate limit and the trusted-proxy setting (19 Nov 2026)

- **Asked:** build the login rate limit. The author also said the admin seed is not needed: they will create the HR manager and its password themselves. So no seed script was built, and the plan now says so (the 10,000-employee seed is separate work in M3).
- **Design decisions made by the AI, for the author to review:**
  - The limit is per client address, default 5 per 60 seconds, set from the environment (`LOGIN_RATE_LIMIT`, `LOGIN_RATE_WINDOW_SECONDS`). It applies to login only, by adding the guard to that route instead of registering it globally, so it does not throttle the 10,000-row directory later. Refresh and logout take a random 256-bit token and cost one indexed lookup, so they are not limited.
  - Failed and successful attempts both count, so the limit cannot be used to test passwords.
  - **No per-account limit, on purpose.** It would let anyone lock the HR manager out by sending wrong passwords for their email. The cost is stated: an attacker with many addresses is not slowed by this limit, and argon2id plus a strong password cover that.
  - `TRUST_PROXY` (how many proxies to trust, 0 to 10, default 0) decides which `X-Forwarded-For` entry is the client. The two mistakes fail differently: too low makes everyone share one limit (safe, annoying), too high lets a client forge its address (a bypass). So the default is the safe one, and the upper bound is a sanity check.
  - Counts are in memory, which is correct for one instance and resets on restart. IPv6 clients are counted by /64 prefix; the throttler already does that.
- **Unverified, and written down as such:** the right `TRUST_PROXY` for Vercel in front of Render cannot be known before deploy. `backend/README.md` has a three-step check using two networks, and it is in the M9 deploy checklist. Nothing here claims the deployed value is right.
- **A flaw in my first design, caught by my own test:** I named the throttler `login`. The `Retry-After` test failed, and reading the library showed that a named throttler sends `Retry-After-login`, which no browser or client understands. It is now named `default`, with a comment saying why, and the cost (any future route using the guard shares that limit unless it sets its own) is recorded in `CLAUDE.md`.
- **Process:** tests first and seen failing (44 env tests, 12 e2e tests that got 401 instead of 429). Two spec files cover the two `TRUST_PROXY` modes, because the environment is read once when the app module loads; each sets its own values at the top of the file and runs in its own worker.
- **Checking that the tests have teeth:** two mutations of the security-critical line were applied and reverted (the file was diffed against a backup). Never configuring `trust proxy` failed 5 per-client tests. Trusting every `X-Forwarded-For` failed the untrusted-proxy test and the forged-header test.
- **Run for real:** the compiled app was started on port 4010 (not the stale server on 3999). A bad `TRUST_PROXY` stopped startup with exit 1 and a message that does not repeat the value. With `LOGIN_RATE_LIMIT=3` and `TRUST_PROXY=1`, one client got 400, 400, 400, 429, a second client was unaffected, a forged leading `X-Forwarded-For` did not help, and the 429 carried `Retry-After: 60`.
- **Help for the manual admin user:** the AI verified the hashing one-liner in `backend/README.md` before documenting it: a hash it produces (argon2id, 19456 KiB, 2 passes, 1 lane) is accepted by the app's own `PasswordHasher` for the right password and rejected for a wrong one. My first check of this was wrong (my text extraction found nothing, so I verified an empty string); I caught it from the empty output and redid it. The `users` table defaults `id` and both timestamps, so a manual insert needs only email, hash, name and role. A reminder that the email must be lower case is in the README, because login lower-cases what it looks up.
- **Verified:** unit (159), e2e (91), integration (43), lint, build and a type-check including the tests pass. `health.service.ts` and `main.ts` still fail `prettier --check`, as before this work.

### 20. The `employees` table (19 Nov 2026)

- **Asked:** start M3 with the `employees` table, columns shown for review before any migration.
- **Sources used for the proposal:** the requirements (F1 to F5), the data model in `architecture.md`, the conventions of the existing tables, the open questions in `performance.md`, and the archived ten-table draft from earlier in the project. The draft was a starting point, not copied: two of its choices were changed after checking them against the documents (see decisions 3 and 4).
- **Proposal and author's response:** the AI proposed 13 columns, listed five decisions it had made itself, and named what it left out. The author approved without changes ("looks good"), including the defaults.
- **Decisions made by the AI, approved by the author:**
  1. One `full_name` column, not first and last: search is "name or code", and names from 15 countries do not split cleanly.
  2. `level` is an integer so it sorts correctly; its range is validated by the API.
  3. `status` and `terminated_on` are both kept (as the data model already said). They could contradict each other, and a database `CHECK` would need hand-written SQL, which the author prefers to avoid. So the service's terminate operation will set both, and a `CHECK` stays available as a later option.
  4. **No secondary indexes yet**, only the unique `employee_code`. This changes what `performance.md` had listed as "planned" indexes: an index added up front would leave no "before" measurement. They are added after the seed, only where `EXPLAIN` shows a need, with before and after recorded. The cost is that the directory filters rely on a scan until then, which is expected to be fine at 10,000 rows and will be measured, not assumed.
  5. `job_title` is free text; the two foreign keys are `ON DELETE RESTRICT`, so a country or department with employees cannot be deleted, matching "leavers are kept, never deleted".
- **Left out on purpose:** a link to `users` (an additive column when the `EMPLOYEE` role arrives), current salary and next increment date (derived from `salary_records`), and contact details, city, manager, employment type and date of birth (not in the requirements, and personal data you do not need is a liability).
- **Process:** the 12 integration tests were written first and seen failing twice, for two different reasons: first no `employee` model in the client, then, after editing `schema.prisma` and generating the client, "the table does not exist". Prisma generated the migration with `--create-only`; the SQL was read line by line against the reviewed design (types, nullability, defaults, the single unique index, both foreign keys, nothing touching existing tables) and only then applied. Test data uses made-up reference codes (`ZZ`, `XXX`) so it can never collide with the realistic seed.
- **Verified:** the database holds `users`, `countries`, `departments`, `refresh_tokens`, `employees` and Prisma's ledger, 3 enum types, 5 applied migrations and no check constraints, which is as designed. The tests left no rows behind: `employees` has 0. `users` has 1 row, an `HR_ADMIN` whose email matches none of the test fixtures; that is the author's own admin account, checked by counts only, with no user data printed.
- **A mistake corrected while documenting:** I first wrote that job title is a dimension of the pay insights. The requirements slice insights by country, department, level and gender; job title is only a directory filter (F2). Fixed before it was committed.
- **Verified:** unit (159), e2e (91), integration (55), lint, build, a type-check including the tests, and all five Mermaid diagrams parse. `health.service.ts` and `main.ts` still fail `prettier --check`, as before this work.

### 21. The employee seed: 10,000 people from faker (19 Nov 2026)

- **Asked:** "create seeders for employee records"; when I paused to explore, the author clarified it is the 10,000-row seed from the requirements. Later they asked for it to use faker.js. Salary history is not part of this step: the `salary_records` table does not exist yet, and the seed will be extended when it does.
- **What changed because the author asked for faker:** I had built the first version with hand-written name lists and a tiny random generator of my own, for one reason: a library's output for a given seed can change between versions, and a seed that is meant to be reproducible should not depend on that. The author preferred faker. I rebuilt it on faker, deleted the name lists and my random generator (and its 17 tests), and kept what is not random: the weights, the job title ladders, the tenure and leaver rules. The reproducibility concern is handled instead by pinning faker to an exact version, a dev dependency used only by the seed, and by documenting that bumping it changes the dataset (`tech-stack.md` decision 13, `CLAUDE.md`). Before installing, I checked the package comes from the official `faker-js/faker` repository and not the old, compromised `faker` name.
- **What faker does and does not do well, from real output rather than memory:** names are good for 12 locales. It has no Singapore locale (I used Chinese, for the majority), and for Japan, the UAE and Singapore it gives names in their own script only. That has a real cost, which is documented: a search typed in Latin letters will not find them, and a later CSV export for Excel will need UTF-8 handling. Changing a country's locale is one line. Faker also returns first and last names separately, and Japanese and Chinese put the family name first, so a small tested formatter handles the order.
- **Decisions made by the AI, for the author to review:** the shape of the workforce (about 15 countries with a few big offices, engineering as the largest department, a seven-level pyramid, tenure that rises with level, about 6% leavers, fewer women in engineering and at senior levels). The gender gap is built in on purpose so the pay-gap insight has something to find; the data is entirely synthetic. Small country and level groups under the privacy threshold of 5 occur naturally and are kept, so that rule shows in the demo. The seed only inserts and never updates or deletes, so it can be re-run or resumed. Asking for more people leaves the earlier ones unchanged, and a test enforces that.
- **Process:** tests first, seen failing, for the generator, the name formatter and the persistence. The database tests run in rolled-back transactions with their own `TST-` code prefix, so they pass whether or not the real database has been seeded.
- **Checking that the tests have teeth, twice:** the first round of deliberate bugs found two weak tests. "People can leave on day 0" slipped through because the check ran on only about 12 leavers, so it now runs across all of about 600. After the rebuild on faker, a second round found that switching off "fewer women at the top" went unnoticed, because the test only asserted "lower" and with about 400 people at the top that is a coin flip, so it now demands a margin of 6 percentage points. Seven deliberate bugs (wrong ratios, off-by-one titles, the wrong locale for Japan, one shared seed for all countries and others) are now each caught by a specific test. A number of mutated files were restored from backups and diffed.
- **Run at full scale, without keeping the data:** the 10,000 inserted in about 7.0 s inside one transaction that was rolled back (0 employees before and after). 10,000 distinct codes; 9,426 active and 574 who have left; about 39% women, 59% men and 2% neither; the country mix follows the weights (the US 2,430, India 2,140 and the UAE 111); 6 country and level groups fall under 5. That timing is one measurement over the pooled URL, not yet a timing of the real command, and `performance.md` says so.
- **Not run for real by me:** `npm run seed` writes 10,000 rows to the author's database, so I left that to them and verified the command's plumbing instead: a bad argument, a missing database setting and an unreachable database each fail cleanly with exit 1 and no credentials in the output.
- **Missed earlier, found now:** in previous steps I sent lint's output to `/dev/null` and only looked at its exit code, so 15 `unbound-method` warnings in my two guard spec files went unseen. They are fixed (`this: void` on the test probe methods), and lint now prints no warnings.
- **Verified:** unit (201), e2e (91), integration (63), lint with no warnings, build and a type-check including the tests all pass. `health.service.ts` and `main.ts` still fail `prettier --check`, as before this work.

### 22. Re-scoping: a system of record loaded by Excel import, not payroll (19 Nov 2026)

- **How it started:** before starting the `salary_records` table, the author asked whether payroll should be assumed to be part of the system, "otherwise it's just a list of employees with salary". The AI answered from the requirements document, then walked through how the planned monthly pay status would really work. The author pointed out the flaw: HR will not mark 10,000 records as paid by hand, and without a payroll integration the feature is not practical. They pasted the original brief, which is vague, and drew attention to its main sentence: manage the salary data in web software, and answer questions about how the organisation pays people.
- **What the AI got wrong, and said so:** the brief says nothing about payroll, payouts, pay status or payslips. Those features (F6 and F8, and the pay-status badge and filter in F1 and F2) were the AI's own additions to the first requirements draft. The "mark all paid" shortcut that made the bulk case workable would only have stamped data nobody verified, which is the pretending the document claimed to avoid. The AI had also oversold the "has everyone been paid?" question as answered; in truth the status would have been only as accurate as what a person typed.
- **An overcorrection, and how the author's questions fixed it:** when the author said the work should involve "no insert or update by manual work: we upload excel and then answer the questions", the AI took it literally and proposed dropping manual maintenance (F4) altogether. The author then asked whether Excel being "managed" implies there was data entry, and whether the app would just be "beautification and analytics" on top of it. That is the right test: if Excel stays the place where data is maintained, the tedium in the brief is never removed. The AI withdrew the overcorrection.
- **The decision (the author approved "ok do it"):** the app is a system of record for compensation, not payroll. The existing spreadsheets are loaded by import (nobody re-types 10,000 rows); small changes (a hire, a promotion, a leaver) are made in the app; big events such as the annual review are one bulk change or a re-import; the insights answer "how the org pays people". The volume reality behind it: after the first load, manual work is a few records a day.
- **What changed in the documents:**
  - `requirements.md` rewritten as a one-pager. It now states the reading of the brief, lists the assumption that the spreadsheets exist but were not given to us (so the import template is ours and the seeded 10,000 stand in for the file), and gives the reasoning for leaving out payroll execution and pay status as the first row of the "left out" table.
  - Features renumbered to F1 to F9: the import (old F10) is now F6 and a Must; the raise planner (old F11) is now F8, "bulk salary change", a Should; the payout and payslip features are gone; F9 is unchanged. Earlier entries in this log use the old numbers and were left as the historical record.
  - `plan.md`: M6 becomes import, export and bulk change; M8 and M10 follow; the deploy milestone number is unchanged. Added the open decision of which Excel library to use, to be settled when M6 starts, with the package's maintenance and security record in mind.
  - `architecture.md`: the monthly payout flow is replaced by an import flow (draft, preview, commit; repeatable, traceable, all or nothing, and omission is not termination). The payout tables were removed from the data model and an `IMPORT` table added. While there, a mismatch was found and fixed: `SALARY_BAND.level` was text but `employees.level` is an integer, and the band had no country reference.
  - `performance.md`: targets and measurement rows for the import and the bulk change replace the payout generation row. `CLAUDE.md` and a comment in the Prisma schema no longer describe a payroll or payouts.
- **What did not change:** no code. Auth, the `employees` table and the seed all stand. The `salary_records` table is still unbuilt: its proposal is being revised (an optional import link, and an optional reason) and awaits the author's approval.
- **Verified:** all five Mermaid diagrams still parse, the Prisma schema validates, and `prisma migrate diff` reports no difference from the database, so the comment edit changes nothing. No test is affected: this change is documents and one comment.
- **A cost worth stating:** this entry and earlier ones describe a design the project moved away from. They are kept on purpose, because the journey (including the AI's wrong assumption and the author's correction) is part of what this log is for.

### 23. The `salary_records` table, and 14 older tests that the seed broke (20 Nov 2026)

- **Asked:** after the re-scoping (entry 22), build `salary_records`, with the columns reviewed first. The author approved them as proposed.
- **What the review changed:** the first proposal put an `import_id` link in this table. That would have forced the `imports` table to be designed now, before the import feature exists. The AI moved it out: `import_id` is added later as a nullable column when `imports` is designed, which is additive and needs no data migration. `reason` became optional, because a spreadsheet rarely says why a salary changed, and an honest "unknown" is better than an invented value. The API will still require a reason for a change made in the app.
- **Decisions made by the AI, approved by the author:** the amount is an annual gross figure in `numeric(14,2)`, named `annual_amount` so the unit cannot be mistaken; the currency is stored on every record, so history keeps its meaning if a person moves country; the table is append-only by the repository's design, not by a database trigger (that would be hand-written SQL); nothing is unique on `(employee_id, effective_from)`, so a correction can share a date, and the newest record wins; a user who changed a salary cannot be deleted; no secondary indexes until the salary history is seeded and measured.
- **Process:** 14 integration tests written first and seen failing, twice, for two different reasons (no model in the client, then no table). Prisma generated the migration with `--create-only`; the SQL was read line by line against the design and only then applied.
- **A vacuous test, caught by checking the failing state:** in the second failing run, 13 of 14 failed and one passed with no table at all. It was "rejects an amount too large for numeric(14,2)", which used `rejects.toThrow()`: any error satisfied it, including "table does not exist". It now inserts the oversized amount with raw SQL and requires Postgres's own "numeric field overflow" message. All 14 then failed for the right reason, and passed once the table existed. Lesson: a test that cannot fail for the wrong reason is worth more than one that passes.
- **The seed broke 14 older tests, and that was my gap.** Between sessions the author ran `npm run seed`: the database now holds 10,000 employees, 15 countries and 10 departments. The countries, departments and employees tests from earlier steps assumed an empty database: they created country `IN`, department `Engineering` and employee `EMP-00001`, which now collide with real rows. I had made the new seed spec robust to a seeded database but did not retrofit the older ones, even though I could see this coming. They now use made-up values only (country codes `XA` to `XC`, currencies `XXX` and `XTS`, a `Test Department` name, an `EMPTEST-` code prefix), and a rule in `CLAUDE.md` says integration tests must pass whether or not the database has been seeded. The suite was run twice in a row against the seeded database, and afterwards nothing had leaked: the real `IN` country still has its real name, and there are no leftover test rows.
- **A useful by-product:** with the seed in the real database I compared it with the rolled-back run from entry 21, using counts only. They are identical: 9,426 active and 574 who have left, 3,888 women, 5,940 men and 172 neither, the US 2,430, India 2,140 and the UK 957, and 6 country and level groups under the privacy threshold of 5. So the seed is deterministic between a real run and a rolled-back one.
- **Verified:** unit (201), e2e (91), integration (77), lint with no warnings, build and a type-check including the tests pass. The database holds `users`, `countries`, `departments`, `refresh_tokens`, `employees`, `salary_records` and Prisma's ledger, 4 enum types, 6 applied migrations and no check constraints; `salary_records` has 0 rows. `health.service.ts` and `main.ts` still fail `prettier --check`, as before.
