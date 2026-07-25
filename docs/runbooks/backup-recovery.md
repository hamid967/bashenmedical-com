# Backup & Recovery Runbook — Bashen Medical

_Owner: فريق حامد._
_Last updated: 2026-07-24._

## 1. What is backed up

| Asset                              | Mechanism                                 | Frequency         | Retention                 |
| ---------------------------------- | ----------------------------------------- | ----------------- | ------------------------- |
| Supabase Postgres (all schemas)    | Managed PITR (point-in-time recovery)     | Continuous WAL    | 7 days rolling            |
| Supabase Postgres — daily snapshot | Managed snapshot                          | Daily 02:00 UTC   | 30 days                   |
| Supabase Storage (private buckets) | Managed replication (S3-compatible)       | Real-time replica | Aligned with obj          |
| Repository (code + migrations)     | Git + Lovable managed history             | Every commit      | Indefinite                |
| Secrets (Lovable Cloud)            | Managed vault — **not backed up in-repo** | N/A               | Vault lifecycle           |
| Immutable audit tables             | Same as DB (PITR + snapshot)              | —                 | ≥ 7 years (see retention) |

## 2. Recovery objectives

| Class                         | RPO     | RTO   |
| ----------------------------- | ------- | ----- |
| Application code              | 0       | < 15m |
| Database (single-tenant loss) | ≤ 5 min | < 1 h |
| Database (full disaster)      | ≤ 5 min | < 4 h |
| Storage object                | ≤ 5 min | < 1 h |

## 3. Restore procedures

### 3.1 Table-level rollback (accidental delete/update)

1. Identify the incident time window from `audit_logs` / `booking_trace_events`.
2. Open a Supabase PITR restore into a **staging project** at `T - Δ`.
3. Export the affected rows using `pg_dump --data-only --table=<t>` (or `COPY` via SQL).
4. Diff against production, then apply via a migration reviewed by two engineers.
5. Log the restore in `docs/reports/restores/<date>-<table>.md` including SQL run and row counts.

### 3.2 Full database restore (SEV-1)

1. IC opens Supabase support ticket in parallel with declaring SEV-1.
2. Restore latest PITR to a **new** project ref; do not overwrite prod until validation passes.
3. Application freeze: point the app at `MAINTENANCE_MODE=true` (short-circuits public routes; admin fns show a banner).
4. Repoint `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` secrets to the new project via `secrets--update_secret`.
5. Rotate JWT signing keys via `supabase--migrate_signing_keys`; force re-auth for all users.
6. Smoke-test with `tests/e2e/` critical suite (booking, portal, admin login).
7. Remove maintenance mode.

### 3.3 Storage object restore

- Recover via Supabase Storage's built-in versioning (private buckets only). The signed-URL server function refuses to serve an object without the expected content hash — verify integrity before re-issuing signed URLs.

## 4. Rehearsal cadence

| Drill                         | Frequency | Owner           |
| ----------------------------- | --------- | --------------- |
| Table-level rollback drill    | Quarterly | Backend on-call |
| Full DB restore to staging    | Bi-annual | Backend + IC    |
| Cross-region DR (**pending**) | Annual    | Platform lead   |
| Storage object restore drill  | Quarterly | Ops             |

Each drill must produce a report under `docs/reports/drills/`. The **cross-region DR drill has not run yet** and is listed as a residual risk in the Phase 12 threat model.

## 5. What backups do not cover

- Application logic bugs that silently corrupt data (mitigation: immutable audit tables + row-level history in `appointment_status_history`, `content_item_versions`, `report_versions`).
- Third-party integrations (WhatsApp, payment provider): re-syncable from provider dashboards.
- Ephemeral in-memory state (correct — server fns run stateless).
