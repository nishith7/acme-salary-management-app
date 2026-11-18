# Performance Considerations

**Status:** plan and measurement approach. No numbers are claimed until they have been measured against the 10,000-employee seed. Results are recorded in section 5.

## 1. Targets (from requirements §5)

| Operation | Target at 10k employees |
|---|---|
| Directory search, filter, sort (one page) | < 500 ms |
| Insight queries (median / P25 / P75, payroll cost, gender gap) | < 1 s |
| Seed script, 10,000 employees with salary history | reasonable to run on demand; measured and recorded |

## 2. Design choices made for performance

- **Aggregate in the database.** Percentiles use `percentile_cont` with `GROUP BY`. The API never loads 10k rows to compute a median in application code.
- **Server-side pagination.** The UI only ever receives one page plus a total count.
- **Select only needed columns.** No `SELECT *`, no loading relations the screen does not show, and no N+1 queries: the directory is one query, not one query per row.
- **Indexes follow the filters.** Planned: employees by `country`, `department`, `level`, `status`; salary history by `(employee_id, effective_from DESC)`; payouts by `(period, status)` plus the unique `(employee_id, period)`.
- **Idempotent bulk operations in one statement.** Payout generation is a single insert with `ON CONFLICT DO NOTHING`; marking paid is a single `UPDATE` in a transaction.
- **Stream exports.** CSV export streams rows rather than building the file in memory.
- **Pooled connections.** The API uses Neon's pooled endpoint so concurrent requests do not each open a Postgres connection.

## 3. Open questions, to be decided with evidence

| Question | Options | How it will be decided |
|---|---|---|
| How to get each employee's current salary in the directory | (a) lateral join / `DISTINCT ON` over salary history; (b) keep a `current_salary` pointer on the employee, updated in the same transaction as a salary change | Compare `EXPLAIN (ANALYZE, BUFFERS)` on the 10k seed. Prefer (a) if it meets the target, since it has one source of truth. |
| Pagination style | offset/limit vs keyset | Offset first (supports arbitrary sort columns and page jumps). Revisit only if deep pages exceed the target. |
| Name search | `ILIKE` scan vs trigram index | At 10k rows a scan is expected to be fast; add `pg_trgm` only if measured to be needed. |

## 4. Environment realities

- **Neon** may suspend an idle database, so the first query after a quiet period is slower. **Render's** free tier can also sleep the API. Both are warmed up before the demo recording, and the README says so.
- Measurements are taken against the deployed stack as well as locally, because network latency to Neon is part of what the user feels.

## 5. Measurement plan and results

How: seed 10,000 employees, then time each endpoint over repeated calls and capture `EXPLAIN (ANALYZE, BUFFERS)` for the slowest queries. Add an index or change a query only when a plan shows the need, and record the before and after.

| Endpoint / query | Before | After | Change made |
|---|---|---|---|
| Directory, default page | TBD | TBD | TBD |
| Directory, filtered and sorted | TBD | TBD | TBD |
| Insights: pay by country / department / level | TBD | TBD | TBD |
| Monthly payout generation (10k rows) | TBD | TBD | TBD |
| Seed script | TBD | TBD | TBD |
