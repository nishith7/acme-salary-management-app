# ACME Salary Management — Requirements

**Status:** v1 · **Owner:** <your name> · **Date:** 18 Nov 2026, revised 19 Nov 2026

## 1. Goal

ACME's HR team manages compensation for ~10,000 employees across multiple countries in spreadsheets. This is slow, error-prone, has no history of who changed what, and makes simple questions ("what do we pay senior engineers in India vs Germany?") take hours.

**Goal:** give the HR Manager one web application to (a) maintain accurate, auditable salary data, starting from the existing spreadsheets, and (b) answer questions about how the organisation pays people, in seconds and without exporting to Excel.

**Primary user:** HR Manager (full access). Employees are *not* users in v1, but the system is designed so employee self-service can be added without restructuring (see §3).

## 2. Scope & features

| # | Feature | Priority |
|---|---|---|
| F1 | **Employee directory** — server-paginated list of 10k employees: name, job title, level, department, country/office, joining date, tenure band (0–1, 1–3, 3–5, 5+ yrs), current salary (local + USD) | Must |
| F2 | **Search & filters** — search by name or employee code; filter by status, country, department, job title, level, tenure band, "below/above salary band" | Must |
| F3 | **Employee profile** — details, current salary, full salary history with reason, date and who changed it | Must |
| F4 | **Maintain data in the app** — add, edit and terminate employees; record a salary change (amount, effective date, reason: promotion / merit / market adjustment / correction); maintain salary bands per country & level | Must |
| F5 | **Pay insights** — total payroll cost and median / P25 / P75 pay by country, department and level; gender pay gap by level; employees outside their band; compa-ratio | Must |
| F6 | **Import from Excel / CSV** — load employees and salaries from the existing spreadsheets: a downloadable template, a validation preview with a row-by-row error report, and a repeatable commit; every salary change it makes is traceable to its upload | Must |
| F7 | **Export** — export the current filtered view to CSV/Excel | Must |
| F8 | **Bulk salary change** — "what does a 5% raise for Engineering in India cost per year?", previewed, then applied to the whole group in one step | Should |
| F9 | **Increment tracking** — next increment due date per employee, "due in next 30/60 days" filter, salary growth since joining (total % and annualised) | Should |

## 3. Key decisions

- **Reading of the brief.** "Manage the salary data via web-based software" is taken to mean that the app replaces the spreadsheets as the place where compensation is maintained, not a viewer on top of them: otherwise HR would keep editing Excel and the tedium would remain. The existing spreadsheets are loaded through import (F6), so nobody re-types 10,000 rows. After that, small changes (a hire, a promotion, a leaver) are made in the app (F4), and big events such as the annual review are one bulk change (F8) or a re-import.
- **A system of record for compensation, not payroll.** Salaries are stored as *effective-dated history*, never overwritten, so every change is auditable and growth over time can be computed (enables F3, F9). An import adds a salary record only when the amount differs from the current one.
- **Multi-currency:** salaries are stored in local currency; comparisons use a fixed, dated USD exchange-rate table so results are reproducible.
- **Built for employees later:** authentication with roles (`HR_ADMIN` now; `EMPLOYEE` later), a `users` table optionally linked to an employee, and authorisation enforced in the service layer (ownership checks), so "employee views own salary" is a new role + screens, not a redesign.
- **Privacy:** insight views hide segments with fewer than 5 people so individuals can't be identified.

## 4. Deliberately out of scope

| Left out | Why |
|---|---|
| **Payroll execution and pay status**: running payroll, monthly payout records, marking people as paid, payslips | The brief is about managing salary data and understanding how ACME pays people, not about paying them; a payroll provider does that. Without an integration to it, a "paid" status would mean 10,000 manual entries, or a "mark all paid" button that stamps data nobody verified. We hold what each person is contracted to earn (the input to payroll), not whether a transfer happened. |
| Statutory tax / social-security calculation, bank transfers | Country-specific, legally complex, and owned by payroll providers. We record salaries, we don't compute net pay or move money. |
| Employee self-service UI | Persona is the HR Manager; architecture supports it (§3) so it can follow in v2. |
| Approval workflows (e.g. manager → HR → finance) | Adds states and roles that don't help answer pay questions; single HR owner in v1. |
| Live FX rates | External dependency and non-reproducible numbers; a dated rate table is enough. |
| Bonus, equity, benefits, allowances | Base salary answers the core questions; other components can extend the same model later. |
| Performance reviews driving increments | Separate domain; v1 tracks *when* increments are due, not *how much* they should be. |
| SSO, fine-grained RBAC, multi-tenancy, notifications | Infrastructure that doesn't change the v1 user's outcome. |

## 5. Assumptions & success measures

- One organisation, ~10k active employees, ~15 countries, one HR Manager role.
- **The data exists in spreadsheets today, and we were not given them.** The import template (F6) is therefore our own: one row per employee with their current salary. A generated 10,000-employee dataset of the same shape stands in for the real file. A real file with different columns would need a column mapping, which is not built in v1.
- Directory search/filter/sort responds in < 500 ms at 10k employees; insight queries in < 1 s (aggregations done in the database); importing the 10,000 rows (validate and apply) takes under a minute. These are targets, measured later.
- Every salary change is traceable (who, when, why, and which upload it came from); no money stored as floating point.
- **Success:** the HR Manager can load the spreadsheet and answer "median pay by level in each country" and "who is paid below band" in under a minute, without exporting data.
