# Backend — ACME Salary Management API

NestJS 12 (ESM) + Prisma + PostgreSQL. See [../docs/tech-stack.md](../docs/tech-stack.md) for the decisions behind this stack.

## Scripts

| Command | What it does |
|---|---|
| `npm run start:dev` | Run the API in watch mode |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests |
| `npm run test:integration` | Tests against the real database (each runs in a rolled-back transaction) |
| `npm run lint` | Lint with oxlint |
| `npm run build` | Compile to `dist/` |
| `npm run prisma:generate` | Regenerate the Prisma client (also runs on `npm install`) |
| `npm run prisma:migrate` | Create and apply a migration from `schema.prisma` (development) |
| `npm run prisma:deploy` | Apply existing migrations |

## Configuration

Copy `.env.example` to `.env`. `DATABASE_URL` is the pooled Neon URL used by the API; `DIRECT_URL` is the direct URL used by Prisma migrations; `JWT_SECRET` signs access tokens (at least 32 characters, different in every environment). The app refuses to start if `DATABASE_URL` is missing or not a Postgres URL, or if `JWT_SECRET` is missing or too short.

Three optional settings control the login rate limit:

| Variable | Default | Meaning |
|---|---|---|
| `LOGIN_RATE_LIMIT` | 5 | Login requests one client address may make per window. Failed and successful ones both count. |
| `LOGIN_RATE_WINDOW_SECONDS` | 60 | The window length. |
| `TRUST_PROXY` | 0 | How many proxies sit in front of the app (0 to 10). **Set it per environment and check it after deploying**, see below. |

A wrong value (a decimal, text, out of range) stops startup with a message naming the variable.

### `TRUST_PROXY` and the rate limit

The limit counts attempts per client address. Behind a proxy (Vercel, Render) the app sees the proxy's address unless it is told how many proxies to trust, and then it reads the real client from `X-Forwarded-For`. Both mistakes are bad, in different ways:

- **Too low** (for example 0 behind a proxy): every user looks like one client, so five attempts in a minute from anyone block everyone.
- **Too high:** a client can put a fake address at the front of `X-Forwarded-For` and get a fresh allowance on every request.

After deploying, check it by hand (you need two different networks, such as your laptop and your phone on mobile data):

1. Make 6 login attempts with a wrong password from the laptop. The 6th must be `429`.
2. From the phone, make one attempt. It must be `401`, not `429`. If it is `429`, `TRUST_PROXY` is too low.
3. From the laptop, repeat the attempt with a forged header: `curl -H "X-Forwarded-For: 1.2.3.4" ...`. It must still be `429`. If it succeeds (401), `TRUST_PROXY` is too high.

The deployed value cannot be known in advance: it depends on how many proxies Vercel's rewrite to Render adds.

## Creating the first user

There is no sign-up and no seed script yet: create the HR manager by hand. The password must be stored as an argon2id hash with the parameters the app uses, and the email in lower case.

1. Make the hash. This asks for the password (so it is not kept in your shell history; it is shown on screen as you type) and prints the hash. Run it from `backend/`:

   ```
   node -e "const rl=require('readline').createInterface({input:process.stdin,output:process.stdout});rl.question('Password: ',async p=>{rl.close();const a=require('argon2');console.log(await a.hash(p,{type:a.argon2id,memoryCost:19456,timeCost:2,parallelism:1}))})"
   ```

   The output looks like `$argon2id$v=19$m=19456,t=2,p=1$...`. Copy only the part starting at `$argon2id`.

2. Insert the user, for example in the Neon SQL editor. The id and timestamps have defaults:

   ```sql
   INSERT INTO users (email, password_hash, name, role)
   VALUES ('hr@example.com', '<the hash>', 'Your Name', 'HR_ADMIN');
   ```

   Use a lower-case email. A mixed-case email is stored as typed but the login looks it up in lower case, so it would never match. A hash from another algorithm or other parameters does not work either: login would simply say "Invalid email or password".

## Seeding the database

`npm run seed` loads the 15 countries, the 10 departments, **10,000 synthetic employees** (the dataset the requirements ask for), the **105 salary bands and 12 exchange rates**, and then **the employees' salary history**, about 59,000 salary records. It builds the project first, then runs against `DIRECT_URL` (or `DATABASE_URL` if only that is set). It prints counts and timings, never a connection string. The salary history is the slower half: about 40 seconds to a remote database.

- **Safe to run again.** It only inserts what is missing and never changes or deletes a row, so if a run is interrupted, run it again to finish.
- **A smaller set:** `npm run seed -- --count=500`. A later, larger run only adds people: the first 500 of a 10,000 run are identical to a run of 500.
- **Reproducible.** The same seed gives the same people on any machine. That depends on `@faker-js/faker` staying at its pinned version: a different version can give different people.
- **What the people look like.** A multinational: the US and India are the biggest offices, engineering the biggest department, there are seven levels in a pyramid, about 6% have left, and there are fewer women in engineering and at senior levels (so the gender pay gap insight has something to find). A handful of small country and level groups fall under the privacy threshold of 5, so that rule is visible too. All of it is synthetic.
- **Names** come from faker in each country's own locale. Japan, the UAE and Singapore get names in their own script (Japanese, Arabic, Chinese), so a search typed in Latin letters will not find them. To change a country's locale, edit `locale` in `src/seed/reference-data.ts`.
- **Starting over.** The seed never deletes. To reseed from scratch, delete the seeded rows yourself first, salary records before employees because a salary record keeps its employee from being deleted: `DELETE FROM salary_records WHERE employee_id IN (SELECT id FROM employees WHERE employee_code LIKE 'EMP-%'); DELETE FROM employees WHERE employee_code LIKE 'EMP-%';`, which removes every employee whose code starts with `EMP-` and their history, and then run the seed again. To redo only the salary history, run just the first statement.
- **Salary history.** Each employee gets a hire record on their joining date, then merit raises on 1 April (about 4%), promotions about every 2.5 years, a market adjustment for a few, and, for about 1 in 100, a wrong amount that a later correction fixes. It is built backwards from today's salary, so everyone's current pay is exactly what the pay model says (`src/seed/pay-model.ts`: a US pay ladder by level, times a country pay index, a department factor and a fixed, illustrative exchange rate). Women are paid about 4% less than men at the same country, level and department, and about 7% of people sit clearly outside a band of 15% either side of the midpoint, so the insights have something to find. Nobody's pay falls.
- **Salary bands and exchange rates.** One band per country and level: the pay model's midpoint (the same for every department) 15% either side, in the country's currency. One exchange rate per currency, in units per US dollar, the same fixed illustrative rates the salaries were built with. Because a band does not depend on department, Customer Support (which pays less) shows up under its band and Engineering over it. Both loaders only insert what is missing.
- **The salary history only touches the numbered set.** It gives a history to EMP-00001 to EMP-`<count>` that have no salary record, so an employee created later in the app, or loaded by an import, never gets an invented salary. An employee that already has any record is left exactly as it is, so re-running adds nothing.
- **Each person's history depends only on them,** not on who else was generated: it is drawn from a random source keyed by the seed and the employee code (`src/seed/random.ts`, no faker), so it cannot change when the employees or faker do. The exchange rates in the pay model are fixed on purpose and will load unchanged into the `fx_rates` table later.

Measured once: inserting the 10,000 employees took about 7 seconds from a laptop to Neon (see [performance.md](../docs/performance.md)).

## Endpoints

| Route | Purpose |
|---|---|
| `GET /health` | Liveness. No database access. |
| `GET /health/ready` | Readiness. 200 if the database answers, 503 otherwise. |
| `POST /auth/login` | Email and password in; a 15-minute access token in the body and a refresh token in an httpOnly cookie out. Rate limited per client address: over the limit it answers `429` with a `Retry-After` header. |
| `POST /auth/refresh` | No body; reads the refresh cookie. Returns a new access token (same shape as login) and replaces the cookie. A token works once; presenting a used one ends that whole login session. |
| `POST /auth/logout` | No body; reads the refresh cookie. Ends that login session, clears the cookie and returns 204. Needs no access token and never fails. |
| `GET /auth/me` | The logged-in user, read from the database. Needs `Authorization: Bearer <access token>`; every route except login, refresh, logout, `/health*` and `/docs*` does. |
| `GET /docs` | Swagger UI: browse and try every endpoint. Use "Authorize" and paste the access token from login to call protected routes. |
| `GET /docs-json` | The OpenAPI document. |

Work in progress.
