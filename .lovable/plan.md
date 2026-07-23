
# Single-Page Booking — Consolidation & Hardening Plan

The project already has a substantial booking system (5,249 LoC across `/book`, Step* components, hold API, atomic RPC, correlation tracing, admin trace explorer). The right move is **not** a rewrite — it is a targeted consolidation + gap-close so the whole journey behaves like one production app on one URL.

## Assumptions
- Keep TanStack Start + TS. No Next.js migration. No parallel `/book-v2` route.
- Existing atomic RPC `confirm_appointment_booking`, `BMC-YYYYMMDD-XXXX` refs, idempotency, correlation IDs, slot_holds, booking_trace_events, NPHIES verification tables, admin trace UI — **all reused as-is**.
- OTP: real SMS provider must be configured via secrets; if absent I will surface an "external integration required" gap rather than fake delivery.
- Server-side "any available doctor" resolution is a new small server fn; not a new table.
- Timezone pinned to `Asia/Riyadh` (already in `src/lib/datetime.ts`).

## Step order change
Current flow: patient info late. Target order: **patient → branch → service → doctor → slot → verification → insurance → review → success**. The stepper, URL `?step=` param, reducer transitions, and draft schema all need to reflect the new order. Guards: changing branch clears service/doctor/slot+hold; changing service or doctor clears slot+hold.

## Work Breakdown

### 1. State model (foundation)
- New `src/lib/booking/types.ts` — typed `BookingStep`, `BookingDraft`, `PatientKind` (`self | dependent | new`), discriminated payment union.
- New `src/lib/booking/schemas.ts` — Zod schema per step; `canAdvance(step, draft)` helper.
- New `src/lib/booking/store.ts` — reducer + `useBookingFlow` hook. Handles cascade clears, hold release side-effects, URL sync (`?step=`), draft autosave (server for signed-in via existing `booking_drafts` if present else session), version bump to 4 with 24h expiry.
- `useBookingDraft` — server draft for authenticated users (server fn), session-scoped for guests; strips PII on rehydrate.

### 2. Shell & navigation
- `src/components/booking/BookingAppShell.tsx` — compact header (logo, back, help, AR/EN), progress stepper, content, sticky desktop summary, mobile bottom sheet, fixed prev/continue bar, autosave indicator, reduced-motion transitions, RTL/LTR, safe-area padding, 44px targets.
- Rewire `src/routes/book.tsx` to be a thin route that mounts the shell + step switch driven by store; delete the 1,106-line monolith's inline logic. No route change; `?step=` becomes canonical.
- `BookingNavigation`, `BookingStepper`, `BookingSummary` extracted as pure presentational.

### 3. Steps (reuse & refit, don't duplicate)
Existing Step* components are retained but adapted to new order + store contract:
- `StepPatient` first — Self / Dependent / New. Dependent list via existing dependents fetcher; new-patient captures name+phone only (identity captured at verification).
- `StepBranch` — active branches + earliest availability chip (new small server fn `getBranchEarliestAvailability`).
- `StepService` — filtered by branch's enabled services.
- `StepDoctor` — includes "Any available doctor" option; server fn resolves the concrete doctor+slot at hold time.
- `StepDate` + `StepTime` merged into `SlotCalendar` (7-day strip + morning/evening filter + nearest-slot CTA). Bounded date range only — no full-month fetch except the month calendar which already exists.
- New `StepVerification` between slot and insurance — Saudi mobile regex (already in `booking-limits.ts`), OTP send/verify via existing send/verify endpoints (or gap-flag if missing), resend timer, attempt cap, rate-limited server-side (reuse `rate-limit-unified.server.ts`).
- `InsuranceSection` reused; reads existing valid NPHIES `insurance_verifications` for the phone/national-id and pre-fills instead of re-verifying.
- `StepReview` + `StepSuccess` retained; success screen already shows BMC ref, QR, calendar; add "Open in patient dashboard" CTA and "notification pending" chips wired to `notification_delivery_logs`.

### 4. Slot hold & concurrency (mostly existing)
- Reuse `useSlotHold` + `/api/public/book/hold`. Store integration: cascade release on branch/service/doctor/slot change, refetch + suggest nearest on expiry, block Continue past slot step when no active hold.
- Confirmation continues to go through atomic RPC — no change to DB contract. Ensure "any doctor" resolves + holds inside a single server fn to prevent TOCTOU.

### 5. Notifications
- After successful RPC, fire-and-forget enqueue rows in existing `notifications` / provider queue tables. Success screen polls `notification_delivery_logs` for status chips (pending → sent/failed). Never block booking on notification failure.

### 6. Admin & patient visibility
Verify (not rebuild):
- Patient portal appointments list already reads own + dependents via RLS.
- `/admin/appointments` already lists with actions. Confirm reference, source, insurance/payment columns render for new rows; add columns only if missing.

### 7. Errors
Central `src/lib/booking/errors.ts` — maps server error codes (`SLOT_TAKEN`, `HOLD_EXPIRED`, `INVALID_IDEMPOTENCY_KEY`, `OTP_INVALID`, `OTP_RATE_LIMITED`, `INSURANCE_UNVERIFIED`, `NETWORK`, `SESSION_EXPIRED`) to AR/EN copy + recovery action + correlation ID surface. Reused by `SubmitErrorBanner`.

### 8. Accessibility & perf
- `aria-current="step"` on stepper, focus moves to step heading on transition, live region for hold countdown updates every 30s (not per second).
- Lazy `React.lazy` for `StepSuccess` (QR/pdf libs), `InsuranceSection` (heavy).
- Query cancellation via TanStack Query abort on step change; prefetch only next step's static data.

### 9. Tests
Add / repair (Vitest + Playwright, run at end):
- Reducer unit tests: cascade clears, hold release, schema gates, back/forward URL sync.
- E2E: new/self/dependent booking (already partly present), racing-slot (extend existing concurrency test), hold-expiry recovery, idempotent replay (exists), back/forward + draft restore, session expiry redirect, RBAC (admin sees, patient sees own), RTL screenshot, mobile viewport.

## Technical / DB Details
- No destructive migrations. If `booking_drafts` table is absent for server-side drafts I will add a small reversible migration; otherwise reuse. (Will inspect first; if absent, guests-only + localStorage encrypted-free minimal payload.)
- No new indexes expected — existing appointment indexes on (doctor_id, appointment_date, appointment_time, status) and slot_holds already cover the paths.
- No secrets exposed client-side. OTP + notification providers stay server-only.

## Out of scope / external gaps to surface
- Real SMS OTP provider wiring (needs user-configured secret).
- Real WhatsApp/Email provider delivery confirmation (needs provider webhook + secrets).
- Payment gateway (self-pay online) — will remain "pay at branch" unless a provider is configured.

## Deliverables report at end
1. Files changed. 2. Any DB migrations (expected: none or one small `booking_drafts` add). 3. Reused infra list. 4. Journeys verified. 5. Test/build results. 6. External integrations still required. 7. Risks.

## Approval
This touches the highest-traffic user flow. Please confirm before I proceed, and flag any of these you want dropped or resequenced (e.g. keep current step order; skip server drafts; defer OTP if no SMS provider yet).
