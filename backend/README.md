# Backend — ACME Salary Management API

NestJS 12 (ESM) + Prisma + PostgreSQL. See [../docs/tech-stack.md](../docs/tech-stack.md) for the decisions behind this stack.

## Scripts

| Command | What it does |
|---|---|
| `npm run start:dev` | Run the API in watch mode |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests |
| `npm run lint` | Lint with oxlint |
| `npm run build` | Compile to `dist/` |
| `npm run prisma:generate` | Regenerate the Prisma client (also runs on `npm install`) |

## Configuration

Copy `.env.example` to `.env`. `DATABASE_URL` is the pooled Neon URL used by the API; `DIRECT_URL` is the direct URL used by Prisma migrations. The app refuses to start if `DATABASE_URL` is missing or not a Postgres URL.

## Endpoints

| Route | Purpose |
|---|---|
| `GET /health` | Liveness. No database access. |
| `GET /health/ready` | Readiness. 200 if the database answers, 503 otherwise. |

Work in progress.
