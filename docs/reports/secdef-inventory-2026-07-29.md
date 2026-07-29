# SECURITY DEFINER Inventory — Batch 2 Baseline (2026-07-29)

Snapshot taken before Batch 2 hardening. All functions in `public` schema
with `prosecdef = true`.

## Aggregate

| Metric | Value |
|---|---|
| Total SECDEF functions | 139 |
| `PUBLIC` role leaks | 1 |
| Internal (`_`-prefixed) with anon EXECUTE | 0 |
| Anon-callable, NOT on `PUBLIC_READ_ALLOWLIST` | 10 |
| Authenticated-only (no anon, not internal, not on allowlist) | 50 |

## Batch 2 targets

### Triggers (revoke anon+auth+PUBLIC)
- `generate_appointment_reference()` — trigger on `appointments`
- `sync_dependent_from_verification_request()` — trigger on `dependent_verification_requests`

### Guest RPCs (add to `PUBLIC_READ_ALLOWLIST`, no revoke needed)
- `confirm_appointment_booking(jsonb, text)` — guest booking confirmation
- `verify_appointment_by_reference(text, text)` — guest lookup by ref+phone
- `log_auth_event(text, uuid, text, text, text, jsonb)` — anon must log pre-session failures (see `test_execute_privileges_regression.py`)

### Authenticated-only (revoke anon)
- `get_ai_escalation_status(uuid)`
- `has_permission_in_branch(uuid, text, uuid)`
- `has_role_in_branch(uuid, app_role, uuid)`
- `is_global_role(uuid, app_role)`
- `user_branch_ids(uuid)`

## Full column table

| function | args | anon_x | auth_x | pub_x |
|---|---|---|---|---|
