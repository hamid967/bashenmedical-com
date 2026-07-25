# Phase 1 — Booking/HIS Audit & Change Manifest

Spec: [`docs/specs/booking-medinous-style.md`](../specs/booking-medinous-style.md) (804 سطر، 30 قسم)
Status: **Awaiting approval — م. حامد**. No production code changed in this phase.
Scope: audit only. Migration Manifest below gates Phase 2+.

---

## 1. Current Architecture (routes)

| Surface        | Existing routes                                                                                                                                                                                                                            | Notes                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Public booking | `/book` (SPA — Phase B done), `/reservations/manage`, `/booking-confirmation`, `/services`, `/verify`                                                                                                                                      | Slot Hold + Idempotency + atomic RPC already live.     |
| Patient portal | `/patient`, `/patient/appointments`, `/patient/reports`, `/patient/prescriptions`, `/patient/billing`, `/patient/insurance`, `/patient/requests`, `/patient/profile`, `/patient/security`, `/patient/notifications`                        | Family portal absent (§18 requires `/patient/family`). |
| Admin          | `/admin` unified shell (v3 "Deep Ocean"), sub-routes: reservations, doctors, inbox, audit-logs, web-vitals, reservations-usage, visual-analytics, ai-streaming, realtime-monitor, release-gate, role-permissions-matrix, super.permissions | **No `/admin/front-desk` yet (§11).**                  |
| Doctor         | doctor_profiles table only                                                                                                                                                                                                                 | **No `/doctor` workspace yet (§19).**                  |
| Branch Manager | Slices in `/admin`, no dedicated dashboard                                                                                                                                                                                                 | **Gap (§20).**                                         |

## 2. Database Map (public schema, 131 tables total; 34 booking-relevant)

| Domain               | Tables present                                                                                                                            | Notes                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Patients             | `patients`, `patient_profiles`, `dependents`, `dependent_verification_requests`, `dependent_verification_documents`, `profiles`           | `patients` has `mrn`, `is_demo`, dual name (ar/en), branch. **`patient_profiles` overlaps `patients` — dedup needed.** |
| Appointments         | `appointments`, `appointment_status_history`, `appointment_waitlist`, `appointment_audit`, `appointment_ref_daily_counter`                | `appointments` has `idempotency_key`, `is_demo`, `reference_number` col but 0 populated rows.                          |
| Slots                | `availability_slots`, `slot_holds`                                                                                                        | `slot_holds` shape matches spec (id, doctor/branch/date/time, session_id, idempotency_key, expires_at, released_at).   |
| Doctors              | `doctors`, `doctor_branches`, `doctor_leaves`, `doctor_profiles`                                                                          | `doctor_branches` deferred per memory — single `branch_id` on `doctors`.                                               |
| Specialties/Services | `specialties`, `service_catalog`                                                                                                          | `service_catalog` unified; used across booking + CMS.                                                                  |
| Insurance            | `insurance_providers`, `insurance_verifications`, `insurance_approvals`, `nphies_requests`, `insurance_verifications` (col `policy_hint`) | NPHIES adapter exists via `nphies_requests`.                                                                           |
| Billing              | `invoices`, `payments`, `refunds`                                                                                                         | Present.                                                                                                               |
| Check-in             | `patient_check_ins`, `patient_qr_scans`                                                                                                   | Present. No `queue_entries` table.                                                                                     |
| Notifications        | `notifications`, `notification_delivery_logs`, `push_subscriptions`, `message_templates`                                                  | Channels covered.                                                                                                      |
| Audit/Ops            | `audit_logs`, `security_audit_log`, `integration_logs`, `booking_trace_events`, `reservation_manage_events`                               | Comprehensive.                                                                                                         |

**Appointment status enum (Postgres `appointment_status`):**

```text
new, confirmed, completed, cancelled, no_show,
held, pending_verification, pending_payment,
checked_in, in_progress
```

Present: 10 states. Spec §10 mandates 16 states.

## 3. Gap Analysis (spec §22 vs. reality)

| Spec table/artifact                                       | Present?                          | Action                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `patients`                                                | ✅                                | Extend with `preferred_language`, `emergency_contact_relation`, `account_status` enum.                                                                                                                                                                                                                             |
| `patient_identifiers` (multi-doc: NID/Iqama/Passport/MRN) | ❌                                | **Phase 2.** New table; migrate scalar `national_id` from `patients`.                                                                                                                                                                                                                                              |
| `dependents` / family members                             | ✅                                | Present with verification workflow.                                                                                                                                                                                                                                                                                |
| `branches`                                                | ✅                                | —                                                                                                                                                                                                                                                                                                                  |
| `clinics` (rooms inside a branch)                         | ❌                                | **Phase 2.** New table `clinics(id, branch_id, name_ar/en, room_no, is_active)`.                                                                                                                                                                                                                                   |
| `specialties`                                             | ✅                                | —                                                                                                                                                                                                                                                                                                                  |
| `services` / `service_catalog`                            | ✅                                | Consider renaming exposed API to `services`; keep table for backcompat.                                                                                                                                                                                                                                            |
| `doctors` / `doctor_specialties`                          | ✅ / ⚠                            | `doctor_specialties` join missing (currently single `specialty_id`). **Phase 2** for multi-specialty.                                                                                                                                                                                                              |
| `doctor_branches`                                         | ✅ (deferred/unused per memory)   | Keep single `branch_id` for now. Revisit in Phase 4.                                                                                                                                                                                                                                                               |
| `doctor_schedules` (weekly rules)                         | ❌                                | **Phase 2.** New.                                                                                                                                                                                                                                                                                                  |
| `schedule_exceptions`                                     | ⚠ (only `doctor_leaves`)          | Extend `doctor_leaves` → generic `schedule_exceptions` with reason enum.                                                                                                                                                                                                                                           |
| `appointment_slots`                                       | ⚠ (as `availability_slots`)       | Keep name; add `capacity`, `overbooking_allowed`.                                                                                                                                                                                                                                                                  |
| `slot_holds`                                              | ✅                                | —                                                                                                                                                                                                                                                                                                                  |
| `appointments`                                            | ✅                                | Add `booking_source` enum col; add `estimated_wait_min`, `arrived_at`, `called_at`, `checked_in_at`. Extend `appointment_status` enum with `slot_held`, `pending_insurance`, `pending_confirmation`, `arrived`, `waiting`, `called`, `in_consultation`, `rescheduled` (map old `in_progress` → `in_consultation`). |
| `appointment_status_history`                              | ✅                                | Enforce `previous_status`, `new_status`, `changed_by`, `reason`, `channel`, `correlation_id`.                                                                                                                                                                                                                      |
| `appointment_notes`                                       | ❌                                | **Phase 4** (doctor workspace).                                                                                                                                                                                                                                                                                    |
| `patient_check_ins`                                       | ✅                                | Add `checked_in_via` (staff/self/qr/kiosk).                                                                                                                                                                                                                                                                        |
| `queue_entries`                                           | ❌                                | **Phase 3.** With states waiting/called/skipped/in_service/completed/cancelled.                                                                                                                                                                                                                                    |
| `waiting_list_entries`                                    | ⚠ (as `appointment_waitlist`)     | Rename in adapter; add `opportunity_expires_at`.                                                                                                                                                                                                                                                                   |
| `insurance_providers`                                     | ✅                                | —                                                                                                                                                                                                                                                                                                                  |
| `patient_insurance_policies`                              | ❌                                | **Phase 5.** Detach from `appointments.insurance_*` scalar cols.                                                                                                                                                                                                                                                   |
| `insurance_eligibility_checks`                            | ⚠ (via `insurance_verifications`) | Rename adapter; align with 11 states.                                                                                                                                                                                                                                                                              |
| `insurance_approvals`                                     | ✅                                | —                                                                                                                                                                                                                                                                                                                  |
| `estimates`                                               | ❌                                | **Phase 5.**                                                                                                                                                                                                                                                                                                       |
| `invoices` / `payments` / `refunds`                       | ✅                                | —                                                                                                                                                                                                                                                                                                                  |
| `notifications` + `notification_delivery_logs`            | ✅                                | —                                                                                                                                                                                                                                                                                                                  |
| `audit_logs` / `integration_logs` / `system_settings`     | ✅                                | —                                                                                                                                                                                                                                                                                                                  |
| `patient_duplicate_cases`                                 | ❌                                | **Phase 2.** Duplicate Review Case workflow.                                                                                                                                                                                                                                                                       |

## 4. Security Findings (baseline)

- RLS enabled on all 131 tables (previous audits).
- Recent hardening: `appointments` INSERT restricted (auth users must match `auth.uid()` or verified phone), `user_roles` SELECT scoped to super_admin or branch, `web_vitals` metric allow-list, `slot_holds` column-level GRANT for anon.
- Outstanding warn: `SUPA_function_search_path_mutable` — residual in extension schema (accepted).
- **Cross-branch RBAC test coverage:** partial. Phase 6 will add explicit IDOR + cross-branch matrix (`test_branch_isolation.py`).

## 5. Change Manifest

Legend: 🟢 safe (additive) · 🟡 medium (data migration, reversible) · 🔴 high (destructive/enum change, requires approval).

### Phase 2 — Foundation

| #   | Change                                                                                                                                                                                                          | Risk | Rollback                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------- |
| 2.1 | CREATE `patient_identifiers` + migrate `patients.national_id` (keep col, sync trigger).                                                                                                                         | 🟢   | `drop table patient_identifiers; drop trigger`.                                                                   |
| 2.2 | CREATE `patient_duplicate_cases` + admin UI.                                                                                                                                                                    | 🟢   | `drop table`.                                                                                                     |
| 2.3 | CREATE `clinics(id, branch_id, name_ar/en, room_no, is_active, is_demo)`.                                                                                                                                       | 🟢   | `drop table`.                                                                                                     |
| 2.4 | CREATE `doctor_schedules` + `schedule_exceptions` (supersedes `doctor_leaves` at API layer; keep table).                                                                                                        | 🟢   | `drop table` (leaves table untouched).                                                                            |
| 2.5 | ALTER `appointments` ADD `booking_source` enum, `arrived_at`, `called_at`, `estimated_wait_min`.                                                                                                                | 🟢   | drop columns.                                                                                                     |
| 2.6 | **Extend enum `appointment_status`** with `slot_held`, `pending_insurance`, `pending_confirmation`, `arrived`, `waiting`, `called`, `in_consultation`, `rescheduled`; rename `in_progress` → `in_consultation`. | 🔴   | Postgres enum values are non-removable — rollback = create new enum + swap column. **Requires م. حامد approval.** |
| 2.7 | State-machine trigger enforcing allowed transitions on `appointments.status`.                                                                                                                                   | 🟡   | drop trigger.                                                                                                     |
| 2.8 | Reference number generator patch: format `BMC-APT-YYYYMMDD-####`, backfill NULLs.                                                                                                                               | 🟡   | keep NULL / previous.                                                                                             |
| 2.9 | Atomic booking RPC review — ensure all 10 steps (§8) inside single tx.                                                                                                                                          | 🟢   | no-op review; changes rewritable.                                                                                 |

### Phase 3 — Ops surfaces

| #   | Change                                                                           | Risk | Rollback         |
| --- | -------------------------------------------------------------------------------- | ---- | ---------------- |
| 3.1 | CREATE `queue_entries` + states.                                                 | 🟢   | drop.            |
| 3.2 | New route `/admin/front-desk`.                                                   | 🟢   | route removal.   |
| 3.3 | Waiting-list opportunity workflow (add `opportunity_expires_at`, `notified_at`). | 🟢   | drop columns.    |
| 3.4 | Reschedule "Hold-New-then-Release-Old" server fn.                                | 🟢   | revert function. |

### Phase 4 — Portals

| #   | Change                                                | Risk |
| --- | ----------------------------------------------------- | ---- |
| 4.1 | `/doctor` workspace (read-only + status transitions). | 🟢   |
| 4.2 | `/admin/branch-manager` dashboard.                    | 🟢   |
| 4.3 | `/patient/family` route.                              | 🟢   |

### Phase 5 — Insurance/Billing

| #   | Change                                                                             | Risk |
| --- | ---------------------------------------------------------------------------------- | ---- |
| 5.1 | CREATE `patient_insurance_policies`.                                               | 🟢   |
| 5.2 | CREATE `estimates`.                                                                | 🟢   |
| 5.3 | Insurance state enum aligned with 11 spec states (via app-layer, not new DB enum). | 🟡   |

### Phase 6 — Security/A11y/Perf

Non-schema — tests + configs.

## 6. Demo / Production Data Separation

- `is_demo boolean not null default false` already on `patients`, `doctors`, `appointments`. Extend to every new table (clinics, queue_entries, etc.).
- RLS pattern (planned, not yet applied):
  ```sql
  create policy "hide_demo_in_production" on public.<t> for select
    using ( not is_demo or coalesce(current_setting('app.show_demo', true)::bool, false) );
  ```
- Feature flag `bookings.show_demo` in `ai_feature_flags` + Super Admin toggle.
- **Rule:** production patient flows never receive `is_demo = true` rows; admin toggle scopes to super_admin.

## 7. Migration Order (post-approval)

```text
Phase 2:  2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 (approval gate) → 2.7 → 2.8 → 2.9
Phase 3:  3.1 → 3.3 → 3.4 → 3.2 (UI last)
Phase 4:  4.3 → 4.1 → 4.2
Phase 5:  5.1 → 5.2 → 5.3
Phase 6:  tests/A11y/perf/docs
```

## 8. Approval Gate

Blocking items requiring م. حامد sign-off before Phase 2 executes:

1. **2.6 — enum extension of `appointment_status`.** Non-removable values; needs conscious approval.
2. Rename `availability_slots` → keep-as-is decision (recommended: keep).
3. `patient_profiles` vs `patients` deduplication approach (keep both / merge / view).
4. Demo-data toggle behavior in super_admin (default OFF in production).

Reply "اعتمد" plus any exceptions, and Phase 2 begins with migration 2.1.
