# Appendix — What Changed Between Batch A2 and Batch A3

**Companion to**: [`batch-a2-a3-secdef-hardening.md`](./batch-a2-a3-secdef-hardening.md)
**Scope**: exact function-level diff between the two hardening passes.

---

## 1. Executive diff

| Dimension | Batch A2 | Batch A3 |
|---|---|---|
| Goal | Bulk removal of `EXECUTE` from `PUBLIC` / `anon` on obvious leaks | Cleanup pass on residuals + tighten remaining anon-accessible fns |
| Fns touched | **~53** | **7** |
| Fns fully sealed (owner/service_role only) | 30+ (G4 internal) | 3 (residual internals) |
| Fns re-scoped to `authenticated` only | 23 (G2 + G3) | 0 |
| Fns re-granted explicitly to `anon+authenticated` (not via `PUBLIC` role) | 0 | 4 |
| Fns added to public-read allowlist with justification | 0 | 1 (`record_permission_error`) |
| Linter warnings after run | 111 (from 191) | **106** |
| Anon-reachable SECDEF fns after run | 36 | **32** |

---

## 2. Batch A2 — bulk removal (recap)

### 2.1 Group G2 — Auth helpers → `authenticated` only

| Function | Before | After |
|---|---|---|
| `public.can_edit_page` | `PUBLIC` EXECUTE | `authenticated` only |
| `public.can_edit_service` | `PUBLIC` EXECUTE | `authenticated` only |

### 2.2 Group G3 — Staff RPCs → `authenticated` + in-body role check (21 fns)

Admin dashboards, RBAC management, pharmacy, home-care, clinical:

- `admin_list_service_inquiries`, `admin_get_service_inquiry`,
  `admin_update_service_inquiry_status`, `admin_assign_service_inquiry`,
  `admin_bulk_update_service_inquiries`, `admin_delete_service_inquiry`,
  `admin_export_service_inquiries`, `admin_service_inquiry_stats`
- `admin_list_roles`, `admin_grant_role`, `admin_revoke_role`,
  `admin_list_branches`
- `admin_list_pharmacy_orders`, `admin_update_pharmacy_order`
- `admin_list_home_care_requests`, `admin_update_home_care_request`
- `admin_list_clinical_notes`, `admin_upsert_clinical_note`
- `admin_list_appointments`, `admin_reschedule_appointment`,
  `admin_cancel_appointment`

### 2.3 Group G4 — Internal helpers & triggers → no external EXECUTE (30+ fns)

`audit_row_change`, `handle_new_user`, `_assert_staff`, `_assert_admin`,
`_assert_super_admin`, `_touch_updated_at`, `_guard_profile_verified_phone`,
and every other trigger body / underscore-prefixed helper.

---

## 3. Batch A3 — cleanup pass

### 3.1 Category X — Fully sealed (owner/service_role only)

These slipped through A2 because they were referenced by cron/watchdog and
were mistakenly assumed to need broader access. A3 confirmed they are only
called from server-only code paths.

| Function | Before A3 | After A3 | Why |
|---|---|---|---|
| `public._purge_old_permission_errors` | `authenticated` | owner only | called only by nightly `pg_cron` under `service_role` |
| `public.evaluate_permission_error_spike` | `authenticated` | owner only | called only by `/api/public/hooks/permission-watchdog` under `service_role` |
| `public.has_resource_permission` | `authenticated` | owner only | wrapped by RLS policies via `SECURITY INVOKER` callers; no direct RPC use |

### 3.2 Category Y — Explicit `anon+authenticated` grants (never `PUBLIC` role)

Previously granted via the `PUBLIC` pseudo-role, which means "every current
and future role, including any custom role added later". A3 pinned them to
the exact two roles they need, closing future-role leaks.

| Function | Before A3 | After A3 |
|---|---|---|
| `public.book_appointment_atomic` | `GRANT EXECUTE TO PUBLIC` | `GRANT EXECUTE TO anon, authenticated` |
| `public.confirm_waitlist_offer` | `GRANT EXECUTE TO PUBLIC` | `GRANT EXECUTE TO anon, authenticated` |
| `public.estimate_appointment_cost` | `GRANT EXECUTE TO PUBLIC` | `GRANT EXECUTE TO anon, authenticated` |
| `public.track_orders_by_phone` | `GRANT EXECUTE TO PUBLIC` | `GRANT EXECUTE TO anon, authenticated` |

Behavior is functionally identical for today's role set, but any newly
added role (e.g. a future `partner_api` role) will not inherit access
unless granted explicitly.

### 3.3 Category Z — Added to public-read allowlist

| Function | Reason | Docs |
|---|---|---|
| `public.record_permission_error` | Telemetry writer used by `installPermissionErrorReporter()` in the browser bundle; must be reachable by `anon` on the guest paths where errors originate. Bounded (rate-limited, sanitized inputs). | [`public_read_allowlist.md`](../security/public_read_allowlist.md) |

---

## 4. What A3 explicitly did **not** change

- The 32 remaining allowlisted anon-reachable SECDEF fns (catalog reads,
  OTP-guarded flows, RLS helpers). Each protects itself internally.
- `SECURITY DEFINER` mode itself — fns kept `DEFINER` because their bodies
  need to bypass RLS on writes (e.g. inserting into audit tables). Switch
  to `SECURITY INVOKER` is deferred to a proposed Batch A4.
- Extension placement (`pg_net`, `pg_cron` in `public`) — deferred to a
  maintenance window (linter warning 0014).

---

## 5. Guard coverage per category

| Category | Blocking pre-merge | Post-merge pinned | Runtime watchdog |
|---|:---:|:---:|:---:|
| A2 G2 auth helpers | ✅ SECDEF guard | ✅ pinned | ✅ |
| A2 G3 staff RPCs | ✅ SECDEF guard | ✅ pinned | ✅ |
| A2 G4 internals | ✅ SECDEF guard | ✅ pinned | ✅ |
| A3 X sealed | ✅ SECDEF guard | ✅ pinned | ✅ |
| A3 Y anon-explicit | ✅ role matrix | ✅ pinned (PUBLIC-only check) | ✅ |
| A3 Z allowlist | ✅ role matrix | — (intentionally reachable) | ✅ |

All three guard layers (see §3 of the parent report) run against every
push to `main`; the pinned check in `tests/security/test_a2_a3_grants_pinned.py`
carries the exact function lists from §2 and §3 of this appendix.

---

## 6. How to regenerate this diff

```bash
# Snapshot proacl for all A2/A3 targeted fns
psql -f scripts/security/dump_proacl_snapshot.sql > /tmp/proacl-now.json

# Diff against pre-A2 baseline
diff docs/security/proacl_snapshot_pre_a2.json /tmp/proacl-now.json
```

Any line in the diff that adds `PUBLIC=X` or `anon=X` on a name listed in
§2 or §3.1 is a regression and must be reverted before merge.
