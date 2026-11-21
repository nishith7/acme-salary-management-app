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
| How to get each employee's current salary in the directory | (a) lateral join / `DISTINCT ON` over salary history; (b) keep a `current_salary` pointer on the employee, updated in the same transaction as a salary change | Compare `EXPLAIN (ANALYZE, BUFFERS)` on the 10k seed. Prefer (a) if it meets the target, since it has one source of truth. **Decided: (a), a lateral join with the `(employee_id, effective_from DESC, created_at DESC)` index.** It takes 45 ms for the default page against the 500 ms target (section 5), so a `current_salary` pointer is not needed. |
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
| Directory, default page (empty body: page 1 of 25, sorted by name) | 30.2 s (`EXPLAIN ANALYZE` execution time). 28 s of it was one `Seq Scan` on `salary_records` run 10,000 times, about 60,000 rows read each time, so about 590 million rows read and discarded | 45 ms (three runs: 45.7, 42.8 and 45.0 ms); the count query takes 4.3 ms | Added the index `salary_records (employee_id, effective_from DESC, created_at DESC)`, the exact order the "salary in force today" lookup reads. The plan now shows 10,000 index lookups at 0.002 ms each. The query itself is unchanged: the `fx_rates` and `salary_bands` joins cost about 0.001 ms per row, so they were never the problem. Measured with `EXPLAIN (ANALYZE, BUFFERS)` on the real 10,000 employees and 59,077 salary records, direct URL, from a laptop to Neon, today fixed at 2026-11-20. This is database time only; the time through the API (network, Nest) has not been measured yet. |
| Directory, filtered and sorted | TBD | TBD | TBD |
| Bulk salary update, the whole directory (9,426 active employees, one row each, raised 3% from a future date) | new feature, no earlier figure | preview 2.1 s; apply 4.7 s (9,426 salaries added under one import); the same file applied again 1.1 s, adding nothing (9,426 rows already in place) | One lookup of the people named (each with the salary in force on its row's date), one pure check, then inserts in batches of 1,000 in one transaction. Measured through the services on the real data, from a laptop to Neon, inside a transaction that was rolled back (afterwards: no import and no linked salary rows, 59,077 salary records as before), so it is database and checking time only; the HTTP time (network, a 430 KB upload) is not measured. The requirements target is under a minute for 10,000 rows. |
| Export of the whole directory as CSV (10,000 employees, no filter) | new endpoint, no earlier figure | 1.7 to 4.2 s for the query (three runs: 4,224, 1,720 and 1,949 ms; the first includes opening the connection), 12 to 16 ms to build the CSV, a 1.3 MB file | The export is the list's query without `LIMIT`, sharing its filters and ordering (one query, no count). Measured through the repository on the real data (10,000 employees, 59,077 salary records), from a laptop to Neon, so it is database and file-building time only; the HTTP response (network, Nest) has not been measured. The requirements target is "a few seconds". If the directory grew tenfold the next step would be to stream rows instead of holding them all. |
| Insights: pay by country / department / level (9,426 current employees) | new endpoint, no earlier figure | about 350 ms for each of the three groupings (three runs each: country 3,778 (connection warm-up), 345, 353 ms; department 356, 351, 351 ms; level 360, 360, 338 ms) against a target of under 1 s | Two aggregate queries per request (the groups, and everyone together) over the directory's own joins, with medians and quartiles worked out in SQL. Measured through the service on the real data, from a laptop to Neon, so it is database and calculation time only; the HTTP time is not measured. |
| Import, 10,000 rows (validate and preview; apply) | TBD | TBD | TBD |
| Bulk salary change, one filtered group | TBD | TBD | TBD |
| Seed script, salary history (59,077 records for the 10,000 employees) | n/a | 42.5 s first run; 25.7 s for a re-run that creates nothing | One rolled-back transaction over the real 10,000 employees, direct URL, from a laptop to Neon; 40 batches of 250 employees, one `createMany` each. The re-run is slow for doing nothing because, with no index on `salary_records.employee_id`, each batch counts records per employee by aggregating the whole table; this is the first case for the `(employee_id, effective_from DESC)` index and should be re-measured when it is added. Generating all 10,000 histories in memory takes 85 ms, so the time is the network. |
| Seed script (10,000 employees) | n/a | 7.0 s | Inserts in 1,000-row batches with `createMany` and `skipDuplicates`. Measured once, inside one rolled-back transaction, from a laptop to Neon (us-east-1) through the pooled URL; the real `npm run seed` (direct URL, no wrapping transaction) has not been timed yet, so treat this as an estimate. |
