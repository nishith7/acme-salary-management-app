# ACME Salary Management — work in progress

A web application for ACME's HR Manager to maintain auditable salary data for ~10,000 employees across countries, track whether each month's salary has been paid, and answer questions about how the organisation pays people.

|  |  |
|---|---|
| Live app | _coming soon_ |
| Demo video | _coming soon_ |

## Stack

TypeScript end to end: NestJS 12 + Prisma + PostgreSQL (Neon) for the API, React + Vite for the UI. See [docs/tech-stack.md](docs/tech-stack.md).

## Repository layout

```
backend/    NestJS API, Prisma schema and migrations
frontend/   React app (not created yet)
docs/       requirements, design, plan, AI log
CLAUDE.md   standing instructions for AI coding tools
```

## Documentation

| What | Where |
|---|---|
| Requirements | [docs/requirements.md](docs/requirements.md) |
| Planning and design notes | [docs/plan.md](docs/plan.md) |
| Architecture diagrams | [docs/architecture.md](docs/architecture.md) |
| Prompts and instructions used with AI tools | [docs/AI_LOG.md](docs/AI_LOG.md), [CLAUDE.md](CLAUDE.md) |
| Trade-off explanations | [docs/tech-stack.md](docs/tech-stack.md) (technical), [docs/requirements.md](docs/requirements.md) §3–4 (product) |
| Performance considerations | [docs/performance.md](docs/performance.md) |

## Running the backend locally

```bash
cd backend
cp .env.example .env   # fill in the Neon connection strings
npm install
npm run start:dev
npm test
```
