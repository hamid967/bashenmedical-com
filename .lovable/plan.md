# Phase 3 — RBAC, RLS, and Data Security

## What already exists (survey)

- `app_role` enum has all 12 requested roles (super_admin, admin/center_admin, branch_manager, reception, doctor, reports_officer, billing_officer, insurance_officer, support_agent, content_manager, auditor, patient) + `pharmacy`.
- `permissions` (key/category/description) and `role_permissions` (role, permission_key) already exist with 30+ mapped entries.
- `has_role` and `has_permission` are `SECURITY DEFINER STABLE` and route `super_admin` as super-role automatically.
- `user_roles` carries `branch_id uuid` and `is_global boolean` — branch-scope groundwork is present.
- `audit_logs` exists with actor/entity/before/after/ip/ua.
- All 12 storage buckets are private. Every `public` table has RLS enabled.

Phase 3 is finishing the wiring, not rebuilding it.

## Gaps to close

1. **Permission catalog** — add missing verbs: `.approve`, `.cancel`, `.assign`, `.export`, `.archive` variants for each domain; `users.manage`, `ai.tools.use`, `ai.actions.execute`. Backfill `role_permissions` for each role per the spec.
2. **Scope helpers** — `has_role_in_branch(uid, role, branch)`, `user_branch_ids(uid) returns setof uuid`, `is_global_role(uid, role)`, `has_permission_in_branch(uid, key, branch)`. All `SECURITY DEFINER STABLE` on `user_roles`.
3. **Branch-scope RLS** — tighten policies on `appointments`, `patient_check_ins`, `patient_visits`, `doctor_leaves`, `nurse_calls`, `inventory_items`, `stock_movements`, `payments`, `invoices`, `refunds`, `insurance_approvals`, `insurance_verifications` so a `reception`/`branch_manager` sees only rows tied to their branch.
4. **Ownership rules** — patients: `patient_id in (own || approved_dependents)`; doctors: rows where they are the assigned doctor OR published to them; auditors: read-only across their scope.
5. **Column-level hardening** — `billing_officer` sees financial columns; `insurance_officer` sees insurance columns; `content_manager` gets `false` SELECT on medical tables. Use restrictive policies + `security_invoker` views where sensitive columns must be hidden.
6. **Immutable audit** — `audit_logs`: add UPDATE/DELETE deny policies, revoke UPDATE/DELETE from all roles, event trigger to prevent DDL drop, monthly partition suggestion documented (not enforced this phase).
7. **Sensitive-read logging** — `log_sensitive_read(entity, entity_id)` server-side helper called from every server fn that returns medical/financial data.
8. **Private storage + signed URLs** — one server route `/api/public/*` NO. Instead a **protected server fn** `mintSignedUrl({ bucket, path })` that: (a) checks `has_permission` + ownership, (b) audit-logs the read, (c) issues a 60-second signed URL via admin client. Never expose bucket names to the client from RLS-bypass paths.
9. **Server-side enforcement layer** — `src/lib/rbac/guard.server.ts`: `assertHasPermission(ctx, key)`, `assertBranchScope(ctx, branchId)`, `assertOwnsPatient(ctx, patientId)`. Every mutating server fn calls one of these before doing work.
10. **Client UI gating** — `src/hooks/use-permissions.ts` (fetches once via a new `getMyPermissions` server fn using `requireSupabaseAuth`, caches in TanStack Query, exposes `can(key)`, `canAny(...)`, `inBranch(id)`). All admin/content buttons wrap in a `<Can permission="…">` component. UI gating never grants access — it only hides controls the server would already reject.
11. **Automated security tests** —
    - `tests/security/test_idor_appointments.py` — Reception A tries to read Reception B's branch rows.
    - `tests/security/test_privilege_escalation.py` — `content_manager` tries to write `medical_reports`.
    - `tests/security/test_export_denied.py` — `support_agent` tries CSV exports.
    - `tests/security/test_cross_patient.py` — Patient X tries to read Patient Y appointments/reports.
    - `tests/security/test_audit_immutability.py` — any role tries UPDATE/DELETE on `audit_logs`.
    - `tests/security/test_signed_url_scope.py` — patient signs URL for another patient's `medical-reports` path → denied.

## Execution — 4 batches, each is one migration + code slice

### Batch 3A — Catalog & scope helpers (DB only, this turn)
- Migration inserts missing permissions, backfills `role_permissions`, creates `user_branch_ids`, `has_role_in_branch`, `has_permission_in_branch`, `is_global_role`. GRANTs preserved. `audit_logs` immutability policies + revokes.

### Batch 3B — Server enforcement + hook (code)
- `src/lib/rbac/guard.server.ts`, `src/lib/rbac/permissions.functions.ts` (getMyPermissions), `src/lib/rbac/log.server.ts` (`logSensitiveRead`, `logMutation`), `src/hooks/use-permissions.ts`, `src/components/rbac/Can.tsx`. Refactor 2-3 existing server fns as reference implementations (`admin/service-inquiries.functions.ts`, `medical-reports.functions.ts`) to demonstrate the pattern.

### Batch 3C — Branch-scoped RLS + storage signed URLs
- Migration tightens branch policies on the 12 clinical/financial tables listed above; `content_manager` denied on medical tables; auditor read-only.
- `src/lib/storage/signed-url.functions.ts` — protected mint function with ownership + permission check + audit.

### Batch 3D — Test suite + linter run
- 6 test files under `tests/security/`. Run `supabase--linter`, fix warnings from batches 3A-3C only, report the rest.

## Deliverable this turn

**Batch 3A only** — the DB foundation must land before anything else can use it. I'll come back for 3B/3C/3D in follow-up turns. Batch 3A is a single migration; nothing else changes.

## Confirmation before I run the migration

Two questions the plan currently assumes; correct me if wrong:

1. **Branch scope on `user_roles.branch_id`**: a NULL `branch_id` on a non-`is_global` role means "not tied to any branch, sees nothing" (safe default). `is_global=true` overrides branch scope. OK?
2. **Content manager on medical tables**: hard SELECT deny (not "view-only, no edit"). OK?

If both are yes, I proceed with Batch 3A on the next turn.
