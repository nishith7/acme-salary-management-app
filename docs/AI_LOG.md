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
