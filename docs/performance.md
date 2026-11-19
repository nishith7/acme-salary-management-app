# Performance Considerations

**Status:** plan and measurement approach. No numbers are claimed until they have been measured against the 10,000-employee seed. Results are recorded in section 5.

## 1. Targets (from requirements §5)

| Operation | Target at 10k employees |
|---|---|
| Directory search, filter, sort (one page) | < 500 ms |
| Insight queries (median / P25 / P75, payroll cost, gender gap) | < 1 s |
| Import of the 10,000-employee spreadsheet (read, validate, preview, then apply) | under a minute in total; the preview and the commit are each measured |
| Seed script, 10,000 employees with salary history | reasonable to run on demand; measured and recorded |

## 2. Design choices made for performance

- **Aggregate in the database.** Percentiles use `percentile_cont` with `GROUP BY`. The API never loads 10k rows to compute a median in application code.
- **Server-side pagination.** The UI only ever receives one page plus a total count.
- **Select only needed columns.** No `SELECT *`, no loading relations the screen does not show, and no N+1 queries: the directory is one query, not one query per row.
- **Indexes follow the filters, and are added after measuring.** The `employees` table was created with only its unique `employee_code`, so there is a real "before" for every index. Candidates once the 10,000-employee seed exists: employees by `country`, `department`, `level`, `status`; salary history by `(employee_id, effective_from DESC)`. Each is added only if `EXPLAIN (ANALYZE, BUFFERS)` shows a need, and recorded in section 5.
- **Set-based bulk operations.** An import validates all rows in memory, matches employees with one lookup by `employee_code` (not one query per row), then writes in batches inside one transaction. A bulk salary change is one `INSERT ... SELECT` over the filtered group. Re-running either is idempotent: unchanged rows are skipped.
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
- **Health checks are split on purpose.** `GET /health` (liveness) never touches the database, so a platform polling it does not keep Neon awake or burn its free compute hours. `GET /health/ready` (readiness) runs `SELECT 1` and is meant for manual checks and deploy verification.
- **First observation, not a benchmark:** from a local machine to Neon (us-east-1, pooled endpoint), the first `/health/ready` call after the API started took about 2.3 s (new connection, possibly a database wake-up) and the next took about 230 ms. Cold-start cost is real and is why the demo is warmed up first.
- Measurements are taken against the deployed stack as well as locally, because network latency to Neon is part of what the user feels.

## 5. Measurement plan and results

How: seed 10,000 employees, then time each endpoint over repeated calls and capture `EXPLAIN (ANALYZE, BUFFERS)` for the slowest queries. Add an index or change a query only when a plan shows the need, and record the before and after.

| Endpoint / query | Before | After | Change made |
|---|---|---|---|
| Directory, default page | TBD | TBD | TBD |
| Directory, filtered and sorted | TBD | TBD | TBD |
| Insights: pay by country / department / level | TBD | TBD | TBD |
| Import, 10,000 rows (validate and preview; apply) | TBD | TBD | TBD |
| Bulk salary change, one filtered group | TBD | TBD | TBD |
| Seed script (10,000 employees; salary history not seeded yet) | n/a | 7.0 s | Inserts in 1,000-row batches with `createMany` and `skipDuplicates`. Measured once, inside one rolled-back transaction, from a laptop to Neon (us-east-1) through the pooled URL; the real `npm run seed` (direct URL, no wrapping transaction) has not been timed yet, so treat this as an estimate. |
