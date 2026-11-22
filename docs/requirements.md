# ACME Salary Management — Requirements

**Status:** v1 · **Owner:** <your name> · **Date:** 18 Nov 2026, revised 22 Nov 2026

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
| F4 | **Maintain pay in the app** — record a salary change (amount, effective date, reason: promotion / merit / market adjustment / correction); maintain salary bands per country & level. People data (hires, edits, leavers) is not maintained here, see §4 | Must |
| F5 | **Pay insights** — total payroll cost and median / P25 / P75 pay by country, department and level; gender pay gap by level; employees outside their band; compa-ratio | Must |
| F6 | **Bulk salary update from Excel / CSV** — change many salaries at once from a spreadsheet: a downloadable template of current salaries, a validation preview with a row-by-row error report (nothing is saved until the HR Manager confirms), and a repeatable commit; every salary change it makes is traceable to its upload. It updates the salaries of existing employees; it does not create or edit people | Must |
| F7 | **Export** — download the current filtered view as a file, straight from the directory, with each person's current salary (local and USD) and pay band | Must |
| F8 | **Bulk salary change** — "what does a 5% raise for Engineering in India cost per year?", previewed, then applied to the whole group in one step | Should |
| F9 | **Increment tracking** — next increment due date per employee, "due in next 30/60 days" filter, salary growth since joining (total % and annualised) | Should |

## 3. Key decisions

- **Reading of the brief.** "Manage the salary data via web-based software" is taken to mean that the app replaces the spreadsheets as the place where compensation is maintained, not a viewer on top of them: otherwise HR would keep editing Excel and the tedium would remain. The people data (who works at ACME, with their title, department and country) is loaded once and is not maintained in the app (§4). Pay is: one change at a time (F4), and big events such as the annual review as a bulk update from a spreadsheet (F6), so nobody re-types 10,000 rows. F8, a raise applied by rule to a filtered group, is a later addition to the same mechanism.
- **A system of record for compensation, not payroll.** Salaries are stored as *effective-dated history*, never overwritten, so every change is auditable and growth over time can be computed (enables F3, F9). An import adds a salary record only when the amount differs from the current one.
- **Multi-currency:** salaries are stored in local currency; comparisons use a fixed, dated USD exchange-rate table so results are reproducible.
- **Built for employees later:** authentication with roles (`HR_ADMIN` now; `EMPLOYEE` reserved), and authorisation enforced in the service layer (ownership checks), so "employee views own salary" is a new role, one small migration (a user is not yet linked to an employee) and new screens, not a redesign. §6.1 lists what is still missing.
- **Privacy:** insight views hide segments with fewer than 5 people so individuals can't be identified.

## 4. Deliberately out of scope

Left out of v1, not forgotten: the ones that are natural next steps (payroll, payslips, tax, employee self-service, leave) are worked through in §6.

| Left out | Why |
|---|---|
| **Payroll execution and pay status**: running payroll, monthly payout records, marking people as paid, payslips | The brief is about managing salary data and understanding how ACME pays people, not about paying them; a payroll provider does that. Without an integration to it, a "paid" status would mean 10,000 manual entries, or a "mark all paid" button that stamps data nobody verified. We hold what each person is contracted to earn (the input to payroll), not whether a transfer happened. |
| **Adding, editing and terminating employees** (people data) | The brief is about salaries. Who works at ACME, with their title, department and country, belongs to HR's people records, and an editable second copy here would be a second source of truth to keep in step, with edge cases (employee codes, transfers, rehires) that do not help answer pay questions. The app holds the people as loaded and manages their pay: salary changes, bulk updates, history and insights. Leavers are shown as they were loaded; recording a leaver is not built. Decided by the author on 21 Nov 2026, after the first plan included it. |
| Statutory tax / social-security calculation, bank transfers | Country-specific, legally complex, and owned by payroll providers. We record salaries, we don't compute net pay or move money. |
| Employee self-service UI | Persona is the HR Manager; architecture supports it (§3) so it can follow in v2. |
| Approval workflows (e.g. manager → HR → finance) | Adds states and roles that don't help answer pay questions; single HR owner in v1. |
| Live FX rates | External dependency and non-reproducible numbers; a dated rate table is enough. |
| Bonus, equity, benefits, allowances | Base salary answers the core questions; other components can extend the same model later. |
| Performance reviews driving increments | Separate domain; v1 tracks *when* increments are due, not *how much* they should be. |
| SSO, fine-grained RBAC, multi-tenancy, notifications | Infrastructure that doesn't change the v1 user's outcome. |

## 5. Assumptions & success measures

- One organisation, ~10k active employees, ~15 countries, one HR Manager role.
- **The data exists in spreadsheets today, and we were not given them.** A generated 10,000-employee dataset stands in for the people and their salaries (the initial load). The bulk update template (F6) is our own: one row per employee, with their current salary and the columns to fill in for a change. A real file with different columns would need a column mapping, which is not built in v1.
- Directory search/filter/sort responds in < 500 ms at 10k employees; insight queries in < 1 s (aggregations done in the database); a bulk update of 10,000 rows (validate and apply) takes under a minute; exporting the directory takes a few seconds. These are targets, measured later.
- Every salary change is traceable (who, when, why, and which upload it came from); no money stored as floating point.
- **Success:** the HR Manager can update salaries from a spreadsheet, with every bad row caught before anything is saved, and answer "median pay by level in each country" and "who is paid below band" in under a minute, without exporting data.

## 6. Where this could go next

v1 is the compensation record. These are the extensions an HR team would ask for next. None is built. Each says why it matters, what v1 already gives it and what is still missing, so the real cost is visible. Several come from watching how HR works day to day, for example employees asking HR for payslips one by one.

### 6.1 Employees sign in and see their own salary and profile

- **Why:** "What is my salary?" and "when was my last raise?" go to HR today. Self-service turns HR from a help desk back into owners of the data.
- **Already in v1:** the `EMPLOYEE` role, the guards, and the rule that every HR controller is `HR_ADMIN` only (an employee token already gets 403 on all of them). The profile and salary history exist for HR.
- **Still needed:** a link from a user to an employee (a nullable column; today the two tables are not linked), sign-in by work email (the people data holds no email), a "me" endpoint that takes the employee from the token and never from the URL, and a read-only screen. An employee must never reach other people's pay or the insights.

### 6.2 Employees download their own payslips and salary letters

- **Why:** people ask HR for payslips for purposes of their own, and HR assembles each one by hand. Self-service removes that queue.
- **Already in v1:** nothing for payslips; they are left out on purpose (§4) because without real payroll figures we would be inventing numbers. A **salary certificate** (a letter stating the current salary) is different: it needs only what we already hold, so it can come first.
- **Still needed:** §6.1 (sign-in), and §6.3 or §6.4 for the figures. A payslip is kept as a record per pay period, not regenerated on request, so what the employee downloaded is what HR can see later. Each download is logged, and HR can issue one on someone's behalf.

### 6.3 Payroll integration, automated or done by HR

- **Why:** payroll is run elsewhere from a copy of the salaries, and two copies drift apart. It is also what finally makes "was this person paid?" an honest question: §4 left pay status out because, without a payroll feed, it means 10,000 manual entries.
- **Already in v1:** the history is effective-dated, so "the salary on 1 March" can be answered; the export (F7) already gives payroll the current salaries as a file; every bulk change traces to its upload.
- **Two modes:** *by HR* (download a file in the layout the payroll provider expects, upload it there, record that it was sent) and *automated* (a monthly push to the provider's API, with failures visible to HR, and the provider reporting back what was paid). The file mode works with any provider, so it comes first; automation is added per provider.
- **Still needed:** a chosen provider, a mapping of our fields to theirs, and a payroll-run record per period (inputs, status, who sent it). Its inputs include the unpaid days from §6.5.

### 6.4 Salary breakdown and country-wise tax and deductions

- **Why:** one annual figure hides how pay is built. Components (basic, allowances, bonus) and statutory deductions differ by country, and a payslip needs both.
- **Already in v1:** one base amount per salary record, in local currency, effective-dated, with a country on every employee. Bonus and equity are listed in §4 as "can extend the same model", and this is that extension.
- **Still needed:** a salary structure of components, dated like salaries; per-country rule sets (tax slabs, contributions), versioned by effective date because they change every year; and a decision on who owns them. Start with the breakdown and gross pay, show tax only as a labelled estimate, and let a payroll provider (§6.3) supply the real net pay where there is one. This is the largest reversal of §4's "we don't compute net pay", so it is last in the order below.

### 6.5 Leave management

- **Why:** pay depends on attendance: unpaid leave lowers that month's pay. Without leave data the inputs to payroll live in yet another spreadsheet.
- **Already in v1:** a country, a joining date and a status on every employee; nothing about leave.
- **Still needed:** leave types and balances by country policy, a holiday calendar per country, requests and approvals (which brings in a manager role and the approval workflows §4 left out), and a monthly total of unpaid days handed to payroll (§6.3). The biggest of these extensions: it is a product of its own, so the choice between building it and integrating one should be made deliberately.

### 6.6 Everyday HR features, in the style of Keka

- **Why:** birthday and work-anniversary reminders, a holiday calendar, an org chart, increment-due and probation-end reminders, announcements. They give employees a reason to open the app other than pay, which is what makes self-service (§6.1) worth the effort.
- **Already in v1:** the joining date, so work anniversaries and tenure milestones need nothing new, and increment-due dates (F9) follow the same approach.
- **Still needed:** a date of birth, which is not held (a new personal field, so decide who may see it; day and month only is enough for reminders); a notification channel such as email (§4 left notifications out); and a reports-to link for the org chart.

### 6.7 Suggested order

1. **Employee sign-in (§6.1).** The smallest step, the hooks exist, and it unlocks §6.2 and §6.6.
2. **Salary breakdown without tax (§6.4), and the salary certificate (§6.2).** They use only data we hold or can add cheaply.
3. **Leave (§6.5), then payroll integration (§6.3).** Payroll needs the unpaid days as an input, so leave comes first.
4. **Payslips (§6.2), then tax by country (§6.4).** Both need real figures from payroll.
5. **Everyday features (§6.6)** at any time after step 1.

Before building any of these: new personal data (date of birth, bank details, tax numbers) needs the same care as salary (who can see it, who looked); people data stays in HR's own records (§4), so employee identity comes from there; and leave, payroll and tax are products in their own right, so for each the question is build or integrate.
