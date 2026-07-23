## Context

The `/book` route already implements most of Phase 4:

- 8-step wizard (service → branch → specialty → doctor → date → time → patient → review → success)
- Named-step URL sync (`?step=patient`), popstate Back/Forward, deep-link fill
- Autosaved draft in `sessionStorage`, versioned + timestamped
- Zod validation, Arabic/English i18n, RTL/LTR
- Desktop sticky `SummarySidebar`, mobile `MobileSummarySheet`
- 5-minute server-authoritative slot hold (`useSlotHold`, `/api/public/book/hold`), auto-refresh, realtime cancel via `slot_holds` channel
- Alternatives banner on `SLOT_TAKEN`/`HOLD_EXPIRED`
- Atomic booking via `submitBooking` with idempotency key, correlation ID, and friendly errors
- Public reference `BMC-YYYYMMDD-XXXX` (via `refFromId` / `reference_number`)
- Realtime availability, "any available doctor" resolution, waitlist CTA
- Success screen with QR, notification-status chips (no delivery claim without provider confirmation)
- Appointments surface in `/patient/appointments` and `/admin/appointments`
- Notifications enqueued separately (booking succeeds even if notify fails)

## Gaps vs. the Phase 4 spec

The requested flow adds a distinct **verification** step (real OTP) and a distinct **insurance** step between review and success. Today:

- Payer type + insurance estimate live inside the patient step (`StepPatient` / `InsuranceSection`)
- OTP only exists via `EmailOtpLinker` after success, not as a gating step before submit
- No mid-flow OTP for guest phone verification tied to the booking submit

Also worth tightening:

- Verify the atomic RPC actually takes a row lock + capacity + patient-overlap check in one txn (currently `submitBooking` → RPC); confirm rollback path.
- Add a race + hold-expiry + duplicate-submit + session-expiry test set explicitly for the new verification step.

## Plan

### 1. Insert Verification step (new step 7)

Renumber to 9 UX steps, keeping URL names stable:

```text
service → branch → specialty → doctor → date → time → patient → verify → insurance → review → success
```

- Add `StepVerify.tsx`: sends OTP to the patient phone via existing `/api/auth/otp/issue` server-fn (WhatsApp/SMS), verifies via `/api/auth/otp/verify`, stores a short-lived `booking_verification_token` in state.
- Guard: cannot advance to `review` unless `patient.phone === verified_phone` and token unexpired (10 min).
- Skip when the user is signed in and their profile phone matches (reuse existing session).
- Update `STEP_NAMES`, `maxReachableStep`, `Stepper`, sidebar, and popstate handler.

### 2. Split Insurance into its own step (new step 8)

- Move `InsuranceSection` out of `StepPatient` into `StepInsurance.tsx`.
- Show self-pay fallback CTA when eligibility check fails or is skipped.
- Persist `insuranceEstimate` in draft as today.

### 3. Server enforcement of verification

- `/api/public/book/create` requires `verification_token` in body; server validates against `otp_challenges` (consumed once, single-use).
- Return `VERIFICATION_REQUIRED` / `VERIFICATION_EXPIRED` codes; wire descriptors into `describeBookingError`.

### 4. Confirm atomic booking invariants

- Audit `book_create_appointment` RPC:
  - `SELECT ... FOR UPDATE` on the slot / doctor+date+time row
  - Capacity check inside the txn
  - Patient-overlap check (same patient, overlapping time) inside the txn
  - Single insert into `appointments` + immutable `appointment_status_history` row
  - Rollback on any failure; idempotency-key short-circuit
- Add a SQL comment documenting the invariants.

### 5. Tests

New tests exercising the added surfaces:

- `tests/e2e/book_verification_flow.py` — new/existing/dependent patient, verify OTP, submit
- `tests/e2e/book_hold_expiry_during_verify.py` — hold expires while on verify → bounce to time
- `tests/e2e/book_duplicate_submit.py` — same idempotency key, single row
- `tests/e2e/book_two_user_race.py` — parallel POSTs, one wins with `SLOT_TAKEN`
- `tests/e2e/book_session_expiry.py` — verification token expiry
- `tests/e2e/book_browser_nav.py` — back/forward preserves step + draft
- `tests/e2e/book_visibility.py` — appears in `/patient/appointments` and `/admin/appointments`
- `tests/react/booking-verify.test.tsx` — client state transitions

### 6. Docs

- Update `docs/features/booking.md` (or create) with the new flow, verification contract, and reference-number policy (`BMC-YYYYMMDD-XXXX`, no DB IDs exposed anywhere in success/notifications).

### Technical notes

- OTP reuses `src/lib/auth/otp.server.ts` (already HMAC+salt hashed, `MAX_ATTEMPTS=5`, TTL 5 min).
- Verification token carried in booking state, not URL, to avoid replay via history.
- Insurance state remains optional; self-pay is the default.
- No changes to `patient_profiles` schema; verification simply proves phone ownership at submit time.
- All new steps register their own `head()` title suffix? — no, single route, no head change needed.

### Out of scope

- Payment collection (deferred to Phase 5 unless requested).
- Nafath ID verification (stub already present, keep as-is).
