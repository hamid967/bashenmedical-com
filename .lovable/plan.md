# Phase 5 — Completion Plan

Most of Phase 5 is already shipped: the `PatientShell` (mobile bottom-nav الرئيسية / مواعيدي / احجز / تقاريري / حسابي), the bento dashboard with all 12 tiles, 9 module routes, unified Loading/Empty/Error/Offline/Forbidden/SessionExpired states, offline cache persistence, per-service `assertPatientAccess` server-side authorization, global session-expiry guard, and exact-path `next` preservation.

Three areas still miss the spec. This plan closes them.

## 1. Appointments — action toolbar

`/patient/appointments` currently only lists upcoming / pending / previous / cancelled. Add per-card actions matching the spec:

- Confirm attendance (calls a `confirmAttendance` server fn — updates `appointment_status_events` and `appointments.confirmed_at`)
- Reschedule (opens a slot-picker dialog reusing `/book` slot search for the same doctor+branch; issues a `rescheduleAppointment` server fn that creates a new hold + atomic swap)
- Cancel (confirm dialog → `cancelAppointment` server fn, respects cancellation window)
- Digital check-in (only enabled within a ±30 min window; calls `digitalCheckIn`, shows queue number)
- Directions (opens Google Maps with branch `lat/lng`)
- Add to Calendar (generates `.ics` client-side from appointment fields)
- Download confirmation (PDF via existing `/api/public/appointments/verify` reference — signed PDF endpoint)
- Request follow-up (creates a `service_inquiries` row of type `follow_up` linked to the appointment)

All actions gated by `assertPatientAccess` + row-ownership check on the server. Optimistic UI with rollback on error. Unified error/session states.

## 2. Reports — secure preview + signed downloads + access history

`/patient/reports` lists lab/radiology/visit summaries but exposes no secure viewer. Add:

- Category tabs: Laboratory / Radiology / Visit summaries / Medical certificates / Referrals (driven by `report_type`)
- **Secure preview**: dialog rendering PDF/image via short-lived signed URL (`signed-url.server.ts`, 5 min TTL, watermark with patient name + timestamp)
- **Signed downloads**: separate `downloadReport` server fn issuing a single-use signed URL, logs to `report_access_log`
- **Access history** panel: reads `report_access_log` (already indexed on `report_id + accessed_at`) and shows who/when accessed each report
- All reads go through `assertPatientAccess`; unauthorized attempts audited via `sensitive-access.server.ts`

## 3. Family — in-portal management

`/patient/family` currently deep-links to the legacy `/portal/family`. Bring it in-portal:

- **Add dependent** dialog: full_name, relationship, DOB, national_id — creates via `createDependent`
- **Verify relationship**: OTP challenge to guardian's phone + doc upload placeholder; sets `dependents.verified_at`
- **Switch active profile**: header profile-switcher chip; persists selected `dependent_id` in a `patient_active_profile` cookie (30 days) and Zustand store; all subsequent queries include `activeSubjectId`
- **Book for dependent**: "احجز لهذا التابع" CTA that navigates to `/book?subject=<dependent_id>`; booking flow honors the id and stamps the appointment with the correct `patient_id`
- **Authorized-records only**: `dependents.access_scopes` controls whether the guardian can see the dependent's reports/prescriptions/invoices — enforced server-side in each `listX` function

Every card retains Loading / Empty / Error / Offline / Forbidden / SessionExpired states.

## Technical notes

- New server fns live in `src/lib/portal/appointment-actions.functions.ts`, `src/lib/portal/report-viewer.functions.ts`, and extend `src/lib/portal/dependents.functions.ts`.
- All use `.middleware([requireSupabaseAuth])` + `assertPatientAccess` + row-ownership guards.
- Signed URLs use existing `signed-url.server.ts` (5 min TTL, path derived from DB).
- Access-history table (`report_access_log`) already exists; add index on `(report_id, accessed_at desc)` if missing.
- Active-profile cookie signed with `SESSION_SECRET`; server functions read it from context.
- e2e tests under `tests/e2e/` for each action (confirm, reschedule, cancel, check-in, download, add dependent, switch profile, book-for-dependent).

## Out of scope

- Payment flow for outstanding invoices (already tracked separately).
- Deep insurance eligibility checks beyond the existing approvals list.
- Push notifications channel (existing WhatsApp/SMS/email path covers the spec).

Approve and I'll execute in three batches (Appointments → Reports → Family), each with tests and a typecheck pass before moving to the next.
