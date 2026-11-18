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
