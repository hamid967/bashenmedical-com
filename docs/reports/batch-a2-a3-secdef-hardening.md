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

### Rollback trigger (unchanged)

Rollback only if within 24 h of a subsequent deploy:
- Watchdog emits `severity='rollback'`, or
- Live logs show `permission denied for function` on a guest-critical path, or
- `e2e-critical-post-a2` fails on main with permission errors.
