# Delivery Plan & Design Notes

**Status:** living document, updated as slices land. Priorities (Must / Should / Could) and feature numbers (F1–F11) come from [requirements.md](requirements.md).

## 1. Approach

- **Vertical slices, test-first.** Each slice is a small, working piece of behaviour (data model, then API, then UI) with fast deterministic tests, committed on its own.
- **Backend first, then frontend, then deploy.** The API and data model are the riskiest part, so they are built and tested before the UI depends on them.
- **Must before anything else.** F1–F7 are the product. F8–F11 (Should and Could) are built only if time remains; they are cut first.
- **Definition of done for a slice:** lint, unit tests and build pass; docs touched if a decision changed; a short entry added to [AI_LOG.md](AI_LOG.md) when AI made a notable contribution or needed correction; committed with a Conventional Commit message.

## 2. Milestones

| # | Milestone | Covers | Status |
|---|---|---|---|
| M0 | Foundations: requirements, tech stack, Nest scaffold, Neon + Prisma connection | all | done |
| M1 | Data model, migration and the 10,000-employee seed (realistic pay by country, level, department) | all | next |
| M2 | Auth: JWT login, `HR_ADMIN` role guard | §3 | planned |
| M3 | Employee directory with search, filters, pagination (backend) | F1, F2 | planned |
| M4 | Employee profile and salary changes, bands, add/edit/terminate | F3, F4 | planned |
| M5 | Pay insights with the privacy threshold (groups under 5 hidden) | F5 | planned |
| M6 | Monthly pay status and CSV export | F6, F7 | planned |
| M7 | CI pipeline and quality tooling (Husky, lint-staged, commitlint, GitHub Actions) | quality | planned |
| M8 | Frontend: directory, profile, insights, pay status | F1–F7 UI | planned |
| M9 | Deploy (Neon, Render, Vercel), demo video, README polish | readiness | planned |
| M10 | Stretch, if time: payslip PDF, increment tracking, CSV import, raise planner | F8–F11 | cut first |

## 3. Design notes

- **System of record, not payroll.** Salary changes append effective-dated history; nothing is overwritten. See [architecture.md](architecture.md) for the data model.
- **Privacy by default.** Insight endpoints return no segment with fewer than 5 people, so an individual cannot be inferred.
- **Realistic seed data.** Insights are only meaningful if the seed is: salaries are generated per country and level with a spread, some employees sit outside their band, both genders are represented, and the seed is deterministic (fixed random seed) so runs are reproducible.
- **Authorisation in services.** Ownership checks sit in the service layer from day one, so the later `EMPLOYEE` role is additive.

## 4. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Scope too large for the time available | Must-first order above; F8–F11 are explicitly cut first |
| Free-tier cold starts hurt the demo | Warm the API and database before recording; documented in the README |
| Insights look meaningless on random data | Structured, deterministic seed (see section 3) |
| Percentile SQL is less type-safe through Prisma | One repository class for raw SQL, covered by integration tests against real Postgres |
| Time lost on tooling | Use framework defaults (Nest 12: Vitest, oxlint) rather than hand-rolled setups |

## 5. Open decisions

Decided when the first related code is written, then recorded in [tech-stack.md](tech-stack.md) or [performance.md](performance.md):

- Request-validation library (Zod via Nest's Standard Schema support, or class-validator).
- Current-salary derivation, pagination style, name-search indexing (see performance.md §3).
- Where the auth token is stored in the browser.
- Export formats: CSV only, or CSV plus XLSX.
