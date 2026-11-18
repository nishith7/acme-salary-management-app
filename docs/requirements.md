# ACME Salary Management — Requirements

**Status:** v1 draft · **Owner:** <your name> · **Date:** 18 Nov 2026

## 1. Goal

ACME's HR team manages compensation for ~10,000 employees across multiple countries in spreadsheets. This is slow, error-prone, has no history of who changed what, and makes simple questions ("what do we pay senior engineers in India vs Germany?") take hours.

**Goal:** give the HR Manager one web application to (a) maintain accurate, auditable salary data, (b) track whether each month's salary has been paid, and (c) answer questions about how the organisation pays people — in seconds, without exporting to Excel.

**Primary user:** HR Manager (full access). Employees are *not* users in v1, but the system is designed so employee self-service can be added without restructuring (see §3).

## 2. Scope & features

| # | Feature | Priority |
|---|---|---|
| F1 | **Employee directory** — server-paginated list of 10k employees: name, job title, level, department, country/office, joining date, tenure band (0–1, 1–3, 3–5, 5+ yrs), current salary (local + USD), and a **current-month pay status** badge (Paid / Pending / Failed) | Must |
| F2 | **Search & filters** — search by name or employee code; filter by status, country, department, job title, level, tenure band, pay status, "below/above salary band" | Must |
| F3 | **Employee profile** — details, current salary, full salary history with reason & who changed it, monthly payout history | Must |
| F4 | **Manage salary data** — record a salary change (amount, effective date, reason: promotion / merit / market adjustment / correction); add, edit, terminate employees; maintain salary bands per country & level | Must |
| F5 | **Pay insights** — answer "how does the org pay people": total payroll cost and median / P25 / P75 pay by country, department and level; gender pay gap by level; employees outside their band; compa-ratio | Must |
| F6 | **Monthly pay status** — generate the month's payout records, mark paid individually or in bulk, see who is unpaid | Must |
| F7 | **Export** — export the current filtered view to CSV/Excel (HR still works in spreadsheets for ad-hoc analysis and sharing) | Must |
| F8 | **Payslip PDF** — download any employee's payslip for a given month | Should |
| F9 | **Increment tracking** — next increment due date per employee, "due in next 30/60 days" filter, salary growth since joining (total % and annualised) | Should |
| F10 | **CSV import** — bulk-load employees and salaries from the existing spreadsheets to make migration realistic | Should |
| F11 | **Raise planner** — "what does a 5% raise for Engineering in India cost per year?" before applying it in bulk | Could |

## 3. Key decisions

- **"Manage salary data" = a system of record for compensation**, not payroll. Salaries are stored as *effective-dated history*, never overwritten, so every change is auditable and growth over time can be computed (enables F3, F9).
- **Pay status & payslips without becoming payroll.** Each month a payout record per employee stores gross pay (from current salary), deduction line items and net pay, plus status. Deductions use a simple, configurable per-country rate for v1 and are clearly labelled as such; real statutory tax calculation is out of scope (see §4).
- **Multi-currency:** salaries are stored in local currency; comparisons use a fixed, dated USD exchange-rate table so results are reproducible.
- **Built for employees later:** authentication with roles (`HR_ADMIN` now; `EMPLOYEE` later), a `users` table optionally linked to an employee, and authorisation enforced in the service layer (ownership checks), so "employee views own payslips" is a new role + screens, not a redesign.
- **Privacy:** insight views hide segments with fewer than 5 people so individuals can't be identified.

## 4. Deliberately out of scope

| Left out | Why |
|---|---|
| Statutory tax / social-security calculation, bank transfers | Country-specific, legally complex, and owned by payroll providers. We record outcomes, we don't compute or move money. |
| Employee self-service UI | Persona is the HR Manager; architecture supports it (§3) so it can follow in v2. |
| Approval workflows (e.g. manager → HR → finance) | Adds states and roles that don't help answer pay questions; single HR owner in v1. |
| Live FX rates | External dependency and non-reproducible numbers; a dated rate table is enough. |
| Bonus, equity, benefits, allowances | Base salary answers the core questions; other components can extend the same model later. |
| Performance reviews driving increments | Separate domain; v1 tracks *when* increments are due, not *how much* they should be. |
| SSO, fine-grained RBAC, multi-tenancy, notifications | Infrastructure that doesn't change the v1 user's outcome. |

## 5. Assumptions & success measures

- One organisation, ~10k active employees, ~15 countries, one HR Manager role.
- Directory search/filter/sort responds in < 500 ms at 10k employees; insight queries in < 1 s (aggregations done in the database).
- Every salary change is traceable (who, when, why); no money stored as floating point.
- **Success:** the HR Manager can answer "median pay by level in each country", "who is paid below band" and "who hasn't been paid this month" in under a minute, without exporting data.
