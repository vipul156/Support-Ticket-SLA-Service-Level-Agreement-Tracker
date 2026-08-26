# Support Ticket & SLA Tracker

A full-stack support ticketing application with a business-hours-aware SLA
engine, role-based access control, and a live dashboard.

## Overview

Support tickets move through a controlled lifecycle (`OPEN → IN_PROGRESS →
RESOLVED → CLOSED`, with a reopen path `CLOSED → OPEN`). Every ticket carries
two SLA clocks — **first response** and **resolution** — that only tick during
business hours. Agents see at-a-glance SLA badges (ON_TRACK / AT_RISK /
BREACHED / MET) and the remaining business minutes for each clock, computed
entirely server-side.

## Stack

| Layer     | Technology                                            |
| --------- | ----------------------------------------------------- |
| Runtime   | Node.js 20 + TypeScript (strict, `no any`)            |
| API       | GraphQL Yoga v5, schema-first (SDL + TS resolvers)    |
| ORM / DB  | Prisma 6 + PostgreSQL 17 (docker-compose provided)    |
| Auth      | JWT (`jsonwebtoken`) + bcryptjs password hashing      |
| Frontend  | React 18 + Vite, TypeScript strict                    |
| Tests     | Vitest — unit + integration (real PostgreSQL)         |

> The assignment targets Bun; this submission runs on Node.js 20 with the same
> `bun`-compatible script names (`bun run dev`, `bun run gendb`, …). All
> dependencies are plain npm packages and the code is pure ESM TypeScript, so
> `bun install && bun run dev` works identically.

## Architecture

```
backend/
  src/
    graphql/schema/schema.graphql   SDL: types, enums, queries, mutations
    graphql/resolvers/              Thin resolvers → services (no business logic)
    services/                       TicketService, AuthService, SLA engine
    services/sla/                   ★ The SLA engine — pure, fully unit tested
    repositories/                   Prisma queries (data access only)
    validation/                     Input validation → AppError(VALIDATION_ERROR)
    auth/                           JWT sign/verify, role guards
    db/                             PrismaClient factory
    errors.ts                       AppError with machine-readable codes
    config.ts                       Env-driven configuration
  prisma/schema.prisma, migrations/, seed.ts
frontend/
  src/…                             React SPA (list, detail, login)
docker-compose.yml                  PostgreSQL 17 + optional pgAdmin
```

**Clean architecture rule:** resolvers parse arguments and call services;
services own business rules and authorization; repositories own SQL/Prisma;
the SLA engine is a pure function library with zero I/O — it takes timestamps
and a policy and returns states. The frontend never computes SLA state; it
renders exactly what the API returns.

## Database Schema

```
User     (id, email unique, name, passwordHash, role REPORTER|AGENT)
Ticket   (id, title, description, status, priority, firstResponseAt,
          firstResponseDueAt, resolvedAt, resolutionDueAt,
          reporterId → User, assigneeId → User?, createdAt, updatedAt)
Comment  (id, body, createdAt, ticketId → Ticket, authorId → User)
Holiday  (id, date unique, name)
```

Indexes: `Ticket(status)`, `Ticket(priority)`, `Ticket(assigneeId)`,
`Ticket(reporterId)`, `Ticket(status, priority)`, `Comment(ticketId)`,
`Holiday(date)`.

## SLA Approach

Policies (business hours = Mon–Fri 09:00–18:00, 9h/day, configurable
`BUSINESS_TIMEZONE`, weekends + configured holidays excluded):

| Priority | First response | Resolution |
| -------- | -------------- | ---------- |
| URGENT   | 1h             | 4h         |
| HIGH     | 4h             | 24h        |
| MEDIUM   | 8h             | 48h        |
| LOW      | 24h            | 72h        |

*Due times* are computed once at ticket creation via
`addBusinessMinutes(createdAt, policy)` and persisted
(`firstResponseDueAt`, `resolutionDueAt`). *States* are derived on read:
comparing the frozen actual time (`firstResponseAt`/`resolvedAt`) or "now"
against the due time using `businessMinutesBetween`:

- `ON_TRACK` — consumed ≤ 75% of the budget
- `AT_RISK` — consumed > 75% and not yet met
- `BREACHED` — past due and not yet met
- `MET` — clock stopped (first response recorded / ticket resolved); never
  downgraded afterwards

**Clock freezing:** once `firstResponseAt` is recorded it is never overwritten
(second/third agent comments don't move it), and once `resolvedAt` is set the
resolution state is frozen at whatever the state was at that moment. The API
additionally returns `firstResponseRemainingMinutes` /
`resolutionRemainingMinutes` (business minutes, negative once past due) so the
frontend can display "3h 12m left" without any SLA math.

**First response** = first comment authored by anyone other than the ticket's
reporter. Reporter's own comments do not count.

All arithmetic uses UTC instants internally (stored as UTC `timestamptz`),
while business-day boundaries are computed in `BUSINESS_TIMEZONE` using
`Intl.DateTimeFormat`-derived offsets (no external tz library) — DST-safe.
The frontend renders timestamps in the viewer's local timezone.

## Status Transition Rules

| From ↓ / To → | OPEN | IN_PROGRESS | RESOLVED | CLOSED |
| ------------- | ---- | ----------- | -------- | ------ |
| OPEN          | –    | ✔ assign/start work | ✔  | ✔ |
| IN_PROGRESS   | – (reopen) | –  | ✔        | ✔ |
| RESOLVED      | – (reopen) | ✘ blocked | –  | ✔ |
| CLOSED        | ✔ reopen | ✘ blocked (must reopen first) | ✘ blocked | – |

`CLOSED → IN_PROGRESS` and `RESOLVED → IN_PROGRESS` are rejected with
`INVALID_STATUS_TRANSITION` — a closed ticket must be reopened to `OPEN`
before work can resume. This keeps the audit trail honest: you can't quietly
jump back into a terminal state.

## Auth

- Roles: `REPORTER` (create tickets, comment) and `AGENT` (assign, change
  status, resolve, plus everything reporters can do).
- Passwords hashed with bcryptjs (10 rounds). JWTs signed with `JWT_SECRET`,
  7-day expiry, `Authorization: Bearer <token>`.
- Authorization is server-side in services: `assignTicket`,
  `changeTicketStatus`, `resolveTicket` require role AGENT; `createTicket`
  requires any authenticated user; `addComment` requires any authenticated
  user (reporter or agent).
- Machine-readable error codes in `extensions.code`:
  `VALIDATION_ERROR`, `TICKET_NOT_FOUND`, `USER_NOT_FOUND`, `UNAUTHORIZED`,
  `FORBIDDEN`, `INVALID_STATUS_TRANSITION`, `INVALID_COMMENT`,
  `EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `BAD_TOKEN`.
  All errors surface as structured GraphQL errors — the server never returns
  an unhandled 500.

## Setup

```bash
docker compose up -d        # PostgreSQL 17 on :5432
bun install                 # or npm install — root + backend/
bun run gendb               # prisma migrate deploy + seed
bun run dev                 # backend on :3000 (GraphQL + SPA)
```

The frontend dev server (optional, for hot reload) runs on :5173 with a
`/graphql` proxy. Seed users:

| Email                 | Password      | Role     |
| --------------------- | ------------- | -------- |
| reporter@example.com  | password123   | REPORTER |
| agent@example.com     | password123   | AGENT    |

Seeded tickets cover all four priorities (plus stale, breached ones) and one
holiday (2027-01-01, "New Year's Day").

### Environment variables

See `backend/.env.example`: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`,
`BUSINESS_TIMEZONE`, `PORT`. No real secrets are committed; `.env` is
git-ignored.

## Example GraphQL Queries

```graphql
# Login
mutation {
  login(email: "agent@example.com", password: "password123") {
    token
    user { id name email role }
  }
}

# Filtered ticket list with SLA
query {
  tickets(status: OPEN, priority: URGENT, slaState: AT_RISK, take: 10) {
    totalCount
    pageInfo { hasNextPage endCursor }
    edges {
      cursor
      node {
        id title status priority
        sla {
          firstResponseState
          resolutionState
          resolutionRemainingMinutes
        }
      }
    }
  }
}

# Create + advance a ticket
mutation {
  createTicket(
    title: "Prod is down"
    description: "API returning 500s"
    priority: URGENT
  ) { id status sla { firstResponseDueAt } }
}
```

## Testing

```bash
cd backend
bun run test:unit         # SLA engine edge cases, transitions, auth, validation
bun run test:integration  # real PostgreSQL via DATABASE_URL (docker compose up -d)
```

SLA unit-test matrix includes: created before/after business hours, Friday
evening rollover, full weekends, holidays, weekend+holiday adjacency,
multi-day spans, DST offsets, boundary conditions (exactly 75% = ON_TRACK,
just over = AT_RISK), and clock freezing. The integration suite exercises the
full create → reporter comment → agent comment → firstResponseAt persisted →
SLA states flow against a live database (no mocks).

## How I'd extend this

- **Persisted SLA snapshots** — a nightly job recomputing due times so
  long-lived queries don't rescan; materialize `slaState` into an indexed
  column with a transition trigger.
- **Escalation webhooks / notifications** — when a ticket flips to AT_RISK or
  BREACHED, POST to Slack/email via a queue (BullMQ).
- **Per-customer SLA policies** — a `SlaPolicy` table keyed by customer/
  plan instead of the global four-tier matrix.
- **Custom business calendars** — per-timezone calendars, half-days,
  on-call overrides.
- **Full-text search** — Postgres `tsvector` over title/description.
- **Audit log** — immutable `TicketEvent` table for every transition,
  assignment, and SLA state flip.
- **Realtime updates** — GraphQL subscriptions over a WebSocket for live
  badge changes.
- **Frontend polish** — virtualized ticket table, saved filter presets,
  per-agent workload view.
