# Patient Portal v2 — Phase 0 Audit Report
Owner: م. حامد · Date: 2026-07-21 · Scope: `/auth`, `/reservations*`, `/book`, `/_authenticated/portal.*`

## 1) Routes & Pages Inventory

### Auth surface (public)
| Route | File | State |
|---|---|---|
| `/auth` | `src/routes/auth.tsx` | Present. Email/password + (OAuth broker). **Missing:** OTP-by-phone flow, national-ID login, session-devices UI, "sign out of all devices". |
| `/reservations` | `src/routes/reservations.tsx` | Guest reservations landing. Works. |
| `/reservations/new` | `src/routes/reservations.new.tsx` | Guest booking. Works. |
| `/reservations/manage` | `src/routes/reservations.manage.tsx` | OTP-based guest manage (edit/cancel/reschedule) + Undo. Works and i18n-covered. |
| `/book` | `src/routes/book.tsx` (+ `src/components/booking/*`) | 9-step wizard, session-persisted, slot-hold, RLS-safe insert via `/api/public/book/create`. Works. |

### Portal surface (`_authenticated`) — 30 routes
| Area | Route file | Working | Gaps |
|---|---|---|---|
| Shell/layout | `portal.tsx` | ✓ uses `PortalShell`, notifications counter | Realtime subscription for `notifications` not wired (initial `SELECT` only) |
| Home | `portal.index.tsx`, `portal.dashboard.tsx` | ✓ | Two dashboards coexist — needs consolidation into "5-questions" hero |
| Appointments | `portal.appointments.tsx`, `portal.calendar.tsx`, `portal.schedule.tsx` | ✓ list/tabs | No inline reschedule/cancel from card in `appointments`; no ICS download; no "add to calendar"; no digital check-in trigger |
| Booking (portal) | `portal.book.tsx` | Redirect/wrapper only | Not integrated with active-family-member context |
| Doctors | `portal.doctors.tsx` | Read-only list | OK |
| Reports/Records | `portal.records.tsx`, `portal.reports.tsx`, `portal.reports.downloads.tsx`, `portal.laboratory.tsx`, `portal.radiology.tsx` | ✓ | **Signed URLs used ad-hoc** — needs uniform helper; no per-document access log |
| Prescriptions | `portal.prescriptions.tsx` | ✓ read | No renewal request action |
| Invoices/Payments | `portal.invoices.tsx`, `portal.payments.tsx`, `portal.refunds.tsx` | ✓ read | **Payment "success" is UI-only** — no verified webhook path shown to patient |
| Insurance | `portal.insurance.tsx` | ✓ | Membership number not masked in list; missing-docs surface partial |
| Inquiries/Orders | `portal.inquiries.tsx`, `portal.orders.tsx`, `portal.orders.$kind.$id.tsx` | ✓ | Unified with website + WhatsApp OK; attachment upload path uses public bucket (needs signed) |
| Family | `portal.family.tsx` | ✓ add/switch | Active-profile indicator not global (no active-family badge in shell) |
| Notifications | `portal.notifications.tsx` | ✓ | Delivery status shown even when provider ack absent |
| Profile | `portal.profile.tsx`, `portal.settings.tsx`, `portal.consents.tsx`, `portal.reminder-preferences.tsx`, `portal.sessions.tsx` | ✓ mostly | Phone/email change **does not require re-OTP**; sessions page exists but no "revoke all" |
| Complaints | `portal.complaints.tsx` | ✓ | OK |

### Bottom-nav / desktop sidebar
- `PortalShell` exists but **no dedicated Bottom Navigation** for mobile; no Safe-Area handling verified.
- No global "active family member" pill in shell.

---

## 2) Functions: Working / Broken / Missing

**Working**
- Guest booking (`/book`), guest manage (`/reservations/manage`) with OTP + Undo.
- Portal read paths for appointments, records, prescriptions, invoices, insurance.
- Notifications feed + unread badge.
- Realtime invalidation hook (`use-realtime-invalidation`) mounted in `_authenticated` layout.

**Partial / needs work**
- Digital check-in table exists (`patient_check_ins`) but no UI trigger in portal.
- Signed URLs for medical documents used per-page — not centralized; no audit trail per download.
- Family switching lacks visible active-profile indicator in shell/nav.

**Missing (per Hamed spec)**
- Phone/OTP login path in `/auth`.
- Nafath readiness placeholder.
- CAPTCHA after N failed OTPs (rate-limit exists for booking; not for auth).
- Prescription renewal action.
- Verified payment success (webhook-driven UI state).
- Mobile Bottom Nav with prominent center "Book" button + Safe Areas.
- AI Assistant panel scoped to user data (read-only actions + confirm + audit).

---

## 3) Tables & RLS (portal-critical)

| Table | Policies | Status |
|---|---|---|
| `appointments` | 8 | Owner-scoped + admin/doctor; recent hardening (owner-only insert) applied. ✓ |
| `patients` | 5 | `profile_id = auth.uid()` + role admin. ✓ |
| `dependents` | 2 | `guardian_user_id = auth.uid()` + `patients.view` perm. ✓ |
| `medical_reports` | 5 | Owner reads only `status='published' AND revoked_at IS NULL`. ✓ Strong. |
| `lab_reports` / `radiology_reports` | 2 each | Owner reads only when `released_at IS NOT NULL`. ✓ |
| `prescriptions` | 3 | Owner read + admin/doctor/pharmacy. ✓ |
| `invoices` / `payments` | 2 / 3 | Owner read via `patients.profile_id`. ✓ Payments insert owner-scoped via invoice join. |
| `insurance_approvals` | 3 | Owner read + insurance.view/manage roles. ✓ |
| `insurance_verifications` | 3 | ✓ |
| `service_inquiries` | 3 | ✓ |
| `notifications` | 5 | ✓ |
| `push_subscriptions` | 1 (`ALL` owner) | ✓ minimal. |
| `profiles` | 4 | ✓ |
| `user_roles` | 3 | ✓ (has_role SECDEF pattern in place). |
| `consent_records` | 7 | ✓ |
| `reminder_preferences` | 4 + audit | ✓ |
| `patient_attachments` | 4 | ✓ |
| `patient_check_ins` | 3 | ✓ |
| `patient_visits` | 4 | ✓ |
| `refunds` | 5 | ✓ |

**RLS: no missing-policy gaps found on portal-critical tables.** Post-Batch-A2/A3 SECDEF privileges remain locked.

---

## 4) Security Findings

| # | Severity | Finding | Recommendation |
|---|---|---|---|
| S1 | High | Sensitive profile mutations (phone, email, national ID) do not require step-up OTP. | Add server-side OTP gate on `updateMyProfile` for those fields. |
| S2 | High | Payment "success" UI can render before webhook confirmation. | Drive UI from `payments.status` after provider webhook; never mark paid client-side. |
| S3 | Med | Some report/attachment previews use `getPublicUrl` fallbacks. | Enforce Signed URLs (short TTL) via one helper `getSignedReportUrl()`; log to `report_downloads_audit`. |
| S4 | Med | No CAPTCHA / lockout after N failed OTPs on auth. | Add attempt counter (already for booking) to `/auth` OTP verify. |
| S5 | Med | No global "sign out all devices" action. | Implement server fn issuing `auth.admin.signOut(userId, 'global')`. |
| S6 | Low | Insurance membership number displayed in full on cards. | Mask to last 4. |
| S7 | Low | Notification delivery status shown without provider ACK. | Show only when `notification_delivery_logs.provider_status` set. |
| S8 | Low | Family active-profile not globally visible → risk of booking for wrong person. | Add persistent active-profile badge in `PortalShell`. |

---

## 5) UX / A11y gaps

- No mobile Bottom Navigation (spec requires 5 tabs + center Book).
- Skeletons/Empty/Error tokens exist (`PortalSkeleton`, `PortalEmptyState`) but not consistently used in every portal page (records/reports/family have ad-hoc states).
- Missing `aria-live` on toast for cancellation/undo.
- No offline empty-state on portal (PWA has offline.html for public).
- RTL/LTR: header nav mirrors correctly; some card action rows use `text-right` hardcoded — should rely on `dir`.

---

## 6) Performance snapshot (from `web_vitals` last 7d, per admin dashboard)
- Portal LCP p75: ~2.4s desktop / ~3.1s mobile (target 2.5s / 2.5s).
- Portal INP p75: ~180ms mobile (target <200ms) — OK.
- CLS p75: 0.06 — OK.
- Largest offender: `portal.appointments` (list re-render + avatars unbounded).

---

## 7) Design Direction (proposed, no code yet)

- **Shell**: Sidebar (desktop) + BottomNav (mobile). Center "Book" FAB with medical-cross glyph. Global "Active Profile" pill top-right (self / dependent).
- **Home**: Bento answering the 5 questions in one screen; each cell links to its detail route.
- **Appointment card**: primary action = context-aware (Check-in → Reschedule → Cancel). Secondary = QR / ICS / directions / contact.
- **Records**: unified list with type-chips (Lab, Rad, Summary, Cert, Referral) + preview drawer.
- **Payments**: only `paid`/`pending`/`failed` from server; no optimistic success.
- **Family switcher**: sheet on mobile / popover on desktop; confirm before switching context mid-booking.
- **AI assistant**: right-side sheet, tool-call surface, all actions gated by `Confirm` + audit row.

---

## 8) Change Manifest (Phase-level)

| Phase | Files (main) | Migrations | Rollback |
|---|---|---|---|
| 1 Auth Hardening | `src/routes/auth.tsx`, new `src/lib/auth/*.functions.ts`, `src/routes/_authenticated/portal.sessions.tsx` | `auth_otp_attempts`, `auth_sessions_view` (RPC) | Drop new tables/RPCs, revert route file. |
| 2 Shell/Nav | `src/components/portal/PortalShell.tsx`, new `BottomNav.tsx`, `ActiveProfilePill.tsx` | — | Revert components. |
| 3 Booking-in-portal | `portal.book.tsx`, booking `types.ts` (add `subjectPatientId`) | — | Revert files. |
| 4 Appointments Center | `portal.appointments.tsx`, new `AppointmentCard.tsx`, `ics.ts` util | — | Revert files. |
| 5 Records | `portal.records.tsx`, `records.functions.ts`, new `report-signed-url.functions.ts`, extend `report_downloads_audit` insert | — | Revert. |
| 6 Rx/Invoices/Insurance | `portal.prescriptions.tsx`, `portal.invoices.tsx`, `portal.insurance.tsx` | `payments.status` derived from provider webhook (function only) | Revert. |
| 7 Inquiries Hub | `portal.inquiries.tsx`, `portal.orders.tsx` | Signed bucket for `inquiry-attachments` | Revert bucket policy. |
| 8 Family | `portal.family.tsx`, shell integration | — | Revert. |
| 9 Notifications | `portal.notifications.tsx`, `notifications.functions.ts` | View joining `notification_delivery_logs` | Drop view. |
| 10 Profile | `portal.profile.tsx`, new `sensitive-update.functions.ts` (step-up OTP) | — | Revert. |
| 11 AI Assistant | new `src/components/portal/AssistantPanel.tsx`, `src/lib/portal/assistant.functions.ts` | `assistant_audit` table | Drop table, remove UI. |
| 12 QA | tests only | — | n/a |

---

## 9) Test Plan

RLS (existing suite + new):
- Owner can read own reports only; another owner denied.
- Guardian can read dependent records only via `dependents` link.
- Payment insert forbidden when invoice not owned.
- Sensitive-profile update denied without valid OTP token.

E2E (Playwright, add to `tests/e2e/portal-redesign/`):
1. Sign up + OTP verify (phone) — throttled after N.
2. Sign in / sign out / sign out all devices.
3. Book, prevent double-booking, cancel, reschedule.
4. Book for dependent (family switch).
5. WhatsApp inquiry appears in portal Requests.
6. View report; another user denied.
7. Pay invoice — UI reflects webhook-confirmed state only.
8. Session expiry → redirect to `/auth?redirect=…`.
9. AR RTL / EN LTR parity.
10. Mobile bottom nav + safe areas.
11. Chrome / Safari / Firefox / Edge.

Unit + Type + Lint + Build + Existing RLS suite must remain green.

---

## 10) Rollback Strategy
- Every migration ships with an inverse.
- New UI behind feature flags: `portal.v2.shell`, `portal.v2.bottomnav`, `portal.v2.ai`.
- Snapshot of `pg_policies` before each batch stored in `docs/audit/rls-snapshots/`.

---

## Decision Required
Approve Phase 1 (Auth & Sessions Hardening) to proceed. No production code changes until م. حامد signs off on this document.
