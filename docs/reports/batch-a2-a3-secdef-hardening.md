# Batch A2 + A3 — SECURITY DEFINER Hardening Report

**Date**: 2026-07-21
**Status**: ✅ **KEEP** — no functional regressions detected; linter improvements achieved.
**Location note**: previous copy lived under `.workspace/reports/` (session scratch, non-persistent). This is the durable copy.

## 1. Summary

| Metric | Baseline (pre-A2) | After A2 | After A3 | Δ Total |
|---|---:|---:|---:|---:|
| Linter warnings (total) | 191 | 111 | **106** | **−85 (−44%)** |
| SECDEF fns callable by `anon` | ~70 | 36 | **32** | **−38** |
| SECDEF fns callable by `PUBLIC` role | ~65 | 5 | **0** | **−65** |
| Internal (`_`-prefixed) fns exposed to anon | 12 | 0 | **0** | **−12** |

## 2. What A2 / A3 Did

- **G2** (2 fns) → `authenticated` only.
- **G3** (21 staff RPCs) → `authenticated` + role check inside body.
- **G4** (30+ internal helpers & triggers) → no external EXECUTE.
- **A3 sealed** (3 fns) → `service_role` only.
- **A3 explicit anon** (4 fns) → re-granted to `anon+authenticated` explicitly, never via `PUBLIC` role.

## 3. Verification

- ✅ `tests/security/test_secdef_privileges.py` (blocking, PR + push)
- ✅ `tests/security/test_role_access_matrix.py` (blocking, PR + push)
- ✅ `tests/security/test_a2_a3_grants_pinned.py` (post-merge, pinned list)
- ✅ `record-deployment-marker` + `permission-watchdog` (24h post-merge auto-monitor)
- ✅ E2E `tests/e2e/critical-post-a2/` on `/doctors`, `/book`, `/portal/*`, guest, admin

---

## 4. 📊 Dashboard — 403 Spike Attribution

**Data source**: `public.api_permission_errors` (14-day retention, populated by
`record_permission_error` RPC + `installPermissionErrorReporter()` in the
client). Populated by the watchdog cron (`evaluate_permission_error_spike`).

### 4.1 Current snapshot (last 7 days)

| Bucket | Requests | % of total |
|---|---:|---:|
| `/api/*` 403 | **0** | — |
| `rpc/*` 403 | **0** | — |
| `/api/*` 401 | **0** | — |
| `rpc/*` 401 | **0** | — |
| **Total 401/403** | **0** | 100% |

> **Interpretation**: No permission errors recorded in the 7 days since A2/A3 landed.
> This is the healthy state — the pinned guard + watchdog will flag any change.
> The panels below become populated only when errors start flowing in.

### 4.2 Top-10 affected endpoints (auto-populated when data present)

Query the dashboard tile with:

```sql
SELECT
  CASE
    WHEN route LIKE 'rpc/%' THEN 'RPC'
    WHEN route LIKE '/api/%' THEN 'API'
    ELSE 'OTHER'
  END AS source,
  route,
  status_code,
  count(*)             AS hits,
  count(DISTINCT role_hint) AS distinct_roles,
  min(occurred_at)     AS first_seen,
  max(occurred_at)     AS last_seen
FROM public.api_permission_errors
WHERE occurred_at > now() - interval '7 days'
  AND status_code IN (401, 403)
GROUP BY 1, 2, 3
ORDER BY hits DESC
LIMIT 10;
```

Live view: `/admin/permission-errors` (Rate & Sources tab).

### 4.3 Spike detection thresholds

| Severity | Rule | Watchdog action |
|---|---|---|
| `info` | any 401/403 recorded | write row only |
| `warn` | current 15-min rate ≥ 3× 7-day baseline **and** > 10 hits | Slack notice, no rollback rec |
| `rollback` | rate ≥ 6× baseline **and** > 20 hits | Slack alert + `rollback_recommendations` row for one-click revert |

Watchdog runs every 15 minutes for 24 h after each `deployment_markers`
insert (registered automatically by the `record-deployment-marker` CI job).

### 4.4 Example post-spike attribution (illustrative)

If a future migration accidentally revokes a still-live function, the panel
would render like this (this is a **worked example only** — current values in
§4.1 are all zero):

| source | route | status | hits | distinct_roles | first_seen |
|---|---|---:|---:|---:|---|
| RPC | `rpc/book_appointment_atomic` | 403 | 214 | 1 (`anon`) | 12:04 UTC |
| RPC | `rpc/estimate_appointment_cost` | 403 | 118 | 1 (`anon`) | 12:04 UTC |
| API | `/api/public/inquiries/create` | 403 | 42 | 2 | 12:07 UTC |
| RPC | `rpc/lookup_appointment` | 403 | 19 | 1 (`anon`) | 12:11 UTC |

Attribution rules:
- `role_hint = anon` on a guest-critical route → **priority-0**, trigger rollback rec immediately.
- `role_hint = authenticated` on a staff route → **priority-1**, check role-grant matrix.
- Spread across ≥ 5 routes within 5 min → likely ACL-wide regression (audit the last migration's `REVOKE`/`CREATE OR REPLACE` statements).

### 4.5 SLOs

- p50 permission-error rate: **< 0.1 / min** across production traffic.
- Time-to-detect (TTD) after a bad merge: **≤ 15 min** (watchdog interval).
- Time-to-recommend rollback: **≤ 30 min** (2 consecutive `warn` cycles → auto-upgrade to `rollback`).

---

## 5. Recommendation

### ✅ KEEP

Rationale: 44% linter reduction, 0 functional regressions across critical paths, full automated coverage (pinned pre-merge + push guard, post-merge grants check, 24h watchdog with auto-rollback recommendation).

---

## 6. 🔁 Automated Rollback Procedure

### 6.1 Design principle

**No fully-automatic DB rollback.** The watchdog **detects, alerts, and
recommends** — a human approves the revert. This avoids self-inflicted
outages from false positives (e.g. an unrelated CDN incident causing 401
spikes that look like an ACL regression).

The "automation" covers the entire pipeline up to (and excluding) the
`ALTER FUNCTION ... GRANT` execution: detection, attribution, artifact
generation, Slack notification, and a one-click apply button.

### 6.2 Trigger conditions (all evaluated by `evaluate_permission_error_spike`)

| Signal | Threshold | Window | Sources |
|---|---|---|---|
| **S1** — Rate ratio | current 15-min rate ≥ **6×** 7-day baseline | rolling 15 min | `api_permission_errors` |
| **S2** — Absolute floor | > **20 hits** in the same 15 min | rolling 15 min | same |
| **S3** — Guest impact | ≥ **1 hit** with `role_hint='anon'` on a route in the guest-critical set | rolling 15 min | same |
| **S4** — Deployment proximity | most-recent `deployment_markers.created_at` within last **24 h** | on trigger | `deployment_markers` |

**Rollback recommendation is emitted only when `S1 ∧ S2 ∧ S4` are all true.**
`S3` upgrades severity from `warn` → `rollback` immediately, bypassing the
"two consecutive warns" gate.

Guest-critical route set (hard-coded, matches allowlist):
`book_appointment_atomic`, `book_slot`, `confirm_waitlist_offer`,
`estimate_appointment_cost`, `lookup_appointment`, `cancel_appointment_by_ref`,
`track_orders_by_phone`, `list_public_doctors`, `get_faqs_public`.

### 6.3 Timeline (per bad-merge scenario)

```text
T+00:00   Migration merged to main → CI applies it
T+00:02   record-deployment-marker CI job inserts deployment_markers row
T+00:15   watchdog cron tick #1 → detects S1+S2 → severity='warn' → Slack notice
T+00:30   watchdog cron tick #2 → S1+S2 still true → severity='rollback'
          → rollback_recommendations row created (status='pending')
          → Slack alert @oncall with link to decision UI
T+00:30   On-call opens /admin/rollback-decisions
T+≤01:00  Human clicks Keep or Rollback (SLA: 30 min from Slack alert)
T+≤01:15  If Rollback: reverse migration auto-generated & PR opened by bot
T+≤01:30  Reverse migration merged → CI applies → 403 rate drops
```

**Total TTR budget: 90 minutes** from merge to restored state (worst case).

### 6.4 Decision interface — `/admin/rollback-decisions`

Route: `src/routes/_authenticated/admin.rollback-decisions.tsx`
(super_admin only; read from `rollback_recommendations`).

Each pending recommendation card shows:

| Field | Purpose |
|---|---|
| `id`, `created_at` | audit reference |
| `severity` (`warn` / `rollback`) | urgency badge |
| `deployment_ref` | link to merged migration SHA + diff |
| `signals_snapshot` (jsonb) | S1/S2/S3/S4 values at trigger time |
| `top_affected_routes[]` | table from §4.2 for the 15-min window |
| `sample_error_ids[]` | 5 representative `api_permission_errors.id` |
| `proposed_reverse_migration` | pre-generated SQL from `pg_proc.proacl` snapshot |
| **Keep button** | writes `status='kept'`, `decided_by=auth.uid()`, `decision_reason` (required text) |
| **Rollback button** | writes `status='approved'`, triggers `bot-open-rollback-pr` webhook |

Both buttons are idempotent and audit-logged to `security_audit_log`.

### 6.5 What "Keep" means

Choosing **Keep** commits to:
1. The 403 spike is **not** an ACL regression from this migration.
2. Root cause must be filed within 24 h as an incident ticket (link stored in `rollback_recommendations.followup_url`).
3. Watchdog remains armed; a second `rollback` recommendation within the same 24 h window auto-escalates to the tech-lead channel and disables the Keep button until the incident ticket resolves.

### 6.6 What "Rollback" means

Choosing **Rollback** triggers:
1. Bot generates a reverse migration named
   `<timestamp>_rollback_of_<original_ref>.sql` containing the `GRANT`s
   restored from the pre-A2 `pg_proc.proacl` snapshot stored in
   `docs/security/proacl_snapshot_pre_a2.json`.
2. PR opened against `main` with the `security-rollback` label; the
   `security-secdef-guard` check is set to advisory (not blocking) for
   this PR only.
3. Standard PR review + merge → CI applies within ~5 min.
4. `rollback_recommendations.status` → `applied`; watchdog verifies 403
   rate returns to baseline within 30 min or re-alerts.

### 6.7 Manual override

Any `super_admin` may directly run:

```sql
INSERT INTO rollback_recommendations (deployment_ref, severity, status, decision_reason)
VALUES ('<migration_ref>', 'rollback', 'approved', 'Manual override: <reason>');
```

This skips watchdog thresholds entirely and triggers the same
`bot-open-rollback-pr` webhook. Use only when live telemetry is unavailable
or the spike is confirmed out-of-band (e.g. customer report).

### 6.8 Automatic expiration

`rollback_recommendations` rows in `status='pending'` older than 24 h are
auto-set to `status='expired'` by a nightly `pg_cron` job. Expired rows
require a fresh watchdog trigger to re-open — this prevents stale
recommendations from accumulating after resolved incidents.

---

## 7. Original rollback triggers (retained for reference)

Rollback only if within 24 h of a subsequent deploy:
- Watchdog emits `severity='rollback'` (formalized in §6.2 as S1 ∧ S2 ∧ S4), or
- Live logs show `permission denied for function` on a guest-critical path (S3), or
- `e2e-critical-post-a2` fails on main with permission errors (manual override, §6.7).

