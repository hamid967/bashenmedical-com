# SECDEF Audit — Batch 2 Results (2026-07-29)

Second-pass EXECUTE hardening on `SECURITY DEFINER` functions in `public`.
No function bodies changed; grants only.

## Baseline vs. after (aggregate)

| Metric | Before batch 2 | After batch 2 |
|---|---:|---:|
| Total SECDEF functions | 139 | 139 |
| `PUBLIC`-role EXECUTE leaks | **1** | **0** |
| Anon-callable, not on allowlist | **10** | **0** |
| Anon-callable (allowlisted) | 24 | 34 |
| Authenticated-only | 90 | 91 |
| Trigger-only (no client role) | 14 | 16 |

## Change ledger

### Category A — Trigger-only helpers (revoke anon + authenticated + PUBLIC)

| Function | Kind | Before | After | Rationale |
|---|---|---|---|---|
| `generate_appointment_reference()` | trigger on `appointments` | pub=✓, auth=✓ | service_role only | Called by trigger engine, never by clients. Also the only remaining `PUBLIC` leak. |
| `sync_dependent_from_verification_request()` | trigger on `dependent_verification_requests` | anon=✓ | service_role only | Trigger, no direct callers. Already documented as such in `secdef-final-2026-07-24.md`. |

### Category B — Authenticated-only RPCs (revoke anon)

| Function | Before | After | Internal guard | Rationale |
|---|---|---|---|---|
| `get_ai_escalation_status(uuid)` | anon=✓, auth=✓ | authenticated only | Row-level RLS on `inbox_items` | Reads staff inbox state; needs a session. |
| `has_permission_in_branch(uuid, text, uuid)` | anon=✓ | authenticated only | — (pure check) | RBAC helper, only meaningful for signed-in users. |
| `has_role_in_branch(uuid, app_role, uuid)` | anon=✓ | authenticated only | — | Same. |
| `is_global_role(uuid, app_role)` | anon=✓ | authenticated only | — | Same. |
| `user_branch_ids(uuid)` | anon=✓ | authenticated only | — | Enumerates a user's branch memberships. |

### Category C — Guest RPCs kept anon-callable, added to allowlist

Not revoked — protected internally. Now explicitly listed in
`tests/security/test_secdef_privileges.py::PUBLIC_READ_ALLOWLIST` so the
audit no longer flags them as "unlisted".

| Function | Guest use case | Internal protection |
|---|---|---|
| `confirm_appointment_booking(jsonb, text)` | Guest booking confirmation from `/book` | Idempotency key + signed slot hold + slot re-check |
| `verify_appointment_by_reference(text, text)` | Guest lookup by reference + phone last-4 | Requires both parts to match; rate-limited at HTTP layer |
| `log_auth_event(text, uuid, text, text, text, jsonb)` | Anon must log failed sign-ins before a session exists | Bounded write, no return payload; asserted required by `test_execute_privileges_regression.py` |

### Defense-in-depth pass

A single `DO $$ … $$` block iterated every `prosecdef` function in `public`
and issued `REVOKE EXECUTE … FROM PUBLIC` where it was still granted.
Result: `pub_leaks = 0` for the whole schema.

## Verification

| Suite | Result |
|---|---|
| `tests/security/test_secdef_privileges.py` | ✅ 0 issues (internal, PUBLIC, anon-unlisted, runtime probe) |
| `tests/security/test_execute_privileges_regression.py` | ✅ 0 static issues (runtime probe skipped — pooler role can't `SET ROLE`) |
| `tests/security/test_a2_a3_grants_pinned.py` | ✅ No regressions in prior batch grants |

## Live catalog snapshot (post-batch)

```sql
SELECT
  COUNT(*) FILTER (WHERE has_function_privilege('public', p.oid,'EXECUTE')) AS pub_leaks,
  COUNT(*) FILTER (WHERE has_function_privilege('anon', p.oid,'EXECUTE')) AS anon_exec,
  COUNT(*) FILTER (WHERE has_function_privilege('authenticated', p.oid,'EXECUTE')) AS auth_exec,
  COUNT(*) AS total
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.prosecdef=true;
-- pub_leaks | anon_exec | auth_exec | total
--         0 |        34 |        91 |   139
```

## What's still WARN in the linter

The linter continues to emit `0028` / `0029` for each SECDEF function that
is EXECUTE-able by anon or authenticated. These are informational: every
remaining anon entry is on the allowlist (guest booking, OTP-guarded
lookups, telemetry, `has_role`), and every authenticated entry has its own
internal `has_role` / RLS gate. Silencing them would require converting
functions to `SECURITY INVOKER`, which is out of scope for this batch (it
touches function bodies and RLS interactions).

## Out of scope

- Function-body changes (`SET search_path`, `SECURITY INVOKER` conversion) — deferred to batch 3.
- NPHIES / online payments — deferred by product.
- `any` → typed refactor — separate track.
