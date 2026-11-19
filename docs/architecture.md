# Architecture

**Status:** proposed design, written before the implementation. Diagrams are updated when the code diverges. The final data model lives in `backend/prisma/schema.prisma`.

## 1. System overview and deployment

```mermaid
flowchart LR
  HR([HR Manager<br/>browser]) -->|HTTPS| UI[React SPA<br/>Vercel]
  UI -->|"REST + JWT"| API[NestJS API<br/>Render]
  API -->|"Prisma + pg adapter<br/>pooled URL"| DB[(Neon Postgres 16)]
  MIG[Prisma migrations] -->|direct URL| DB
  SEED[Seed script<br/>10,000 employees] -->|direct URL| DB
  CI[GitHub Actions<br/>lint, test, build] -.->|on every push| API
```

- The browser only talks to the API. The database is never exposed to the client and credentials live only in server-side environment variables.
- The running API uses Neon's pooled endpoint. Migrations and the seed script use the direct endpoint, because they hold long-lived sessions and advisory locks.

## 2. Backend layering

```mermaid
flowchart TB
  C["Controller<br/>routing, input validation, JWT + role guard"] --> S["Service<br/>business rules, ownership checks, transactions"]
  S --> D["Domain functions (pure)<br/>tenure band, compa-ratio, growth, band check"]
  S --> R["Repository<br/>Prisma queries, raw SQL aggregates"]
  R --> P[(PostgreSQL)]
```

Planned Nest modules: `auth`, `employees`, `salaries` (history and bands), `payouts`, `insights`, `export`. Each follows the same controller → service → repository shape.

Why this shape: domain rules are pure functions, so most unit tests need no database and run in milliseconds. Authorisation lives in services, so adding an `EMPLOYEE` role later means new guards and screens, not a redesign (requirements §3).

## 3. Monthly payout flow (F6)

```mermaid
sequenceDiagram
  actor HR as HR Manager
  participant API
  participant DB
  HR->>API: POST /payouts/generate {month}
  API->>DB: insert one payout per active employee<br/>ON CONFLICT (employee_id, period) DO NOTHING
  DB-->>API: rows created
  API-->>HR: 201 {created, skipped}
  HR->>API: POST /payouts/mark-paid {ids or filter}
  API->>DB: UPDATE status = PAID, paid_at = now() (one transaction)
  API-->>HR: 200 {updated}
```

Generation is idempotent: a unique constraint on `(employee_id, period)` means re-running it for the same month cannot create duplicates.

## 4. Data model (proposed)

**Implemented so far:** `users`, `countries`. Tables are added one at a time, each reviewed and migrated separately; everything else below is still proposed.

```mermaid
erDiagram
  COUNTRY ||--o{ EMPLOYEE : "based in"
  DEPARTMENT ||--o{ EMPLOYEE : "belongs to"
  EMPLOYEE ||--o{ SALARY_RECORD : "salary history"
  EMPLOYEE ||--o{ PAYOUT : "monthly payout"
  PAYOUT ||--o{ PAYOUT_DEDUCTION : "line items"
  COUNTRY ||--o{ SALARY_BAND : "defines"
  COUNTRY ||--o{ DEDUCTION_RATE : "configures"
  USER |o--o| EMPLOYEE : "optionally linked"
  USER ||--o{ SALARY_RECORD : "changed by"

  COUNTRY {
    uuid id PK
    string code UK "ISO 3166-1 alpha-2, char(2)"
    string name
    string currency_code "ISO 4217, char(3)"
  }
  DEPARTMENT {
    uuid id PK
    string name UK
  }
  EMPLOYEE {
    uuid id PK
    string employee_code UK
    string full_name
    string gender
    string job_title
    string level
    date joining_date
    string status "ACTIVE or TERMINATED"
    date terminated_on
  }
  SALARY_RECORD {
    uuid id PK
    decimal amount "local currency"
    date effective_from
    string reason "PROMOTION, MERIT, MARKET_ADJUSTMENT, CORRECTION"
    uuid changed_by FK
    timestamp created_at
  }
  SALARY_BAND {
    uuid id PK
    string level
    decimal min_amount
    decimal max_amount
  }
  PAYOUT {
    uuid id PK
    date period "UK with employee_id"
    decimal gross
    decimal net
    string status "PENDING, PAID, FAILED"
    timestamp paid_at
  }
  PAYOUT_DEDUCTION {
    uuid id PK
    string label
    decimal amount
  }
  DEDUCTION_RATE {
    uuid id PK
    string label
    decimal rate
  }
  USER {
    uuid id PK
    string email UK
    string password_hash
    string name
    string role "HR_ADMIN now, EMPLOYEE later"
  }
  FX_RATE {
    string currency_code PK
    date valid_from PK
    decimal usd_per_unit
  }
```

Notes:

- `SALARY_RECORD` is append-only. The current salary is the latest record with `effective_from <= today`. This is what makes every change auditable and growth computable (F3, F9).
- All money columns are `NUMERIC` (Prisma `Decimal`), never floating point.
- `FX_RATE` is a dated table, not tied to a country by foreign key: a country's `currency_code` selects the rate row in force on a given date, so USD comparisons are reproducible.
- Terminated employees are kept (`status`), never deleted, so history and payouts stay intact.
