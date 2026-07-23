# Phase 2 — Secure Unified Authentication (Slice 2A)

Deliver a single unified auth surface for patients, staff, and doctors on top of the existing Supabase (localStorage) session. HttpOnly-cookie migration is deferred; every other Phase 2 requirement lands in this slice.

## Scope of this slice

In:
- New `/auth/*` route family + guarded redirect flow
- WhatsApp OTP via existing project provider (real send, real verify, no plaintext at rest)
- Split profile tables + backfill from `profiles`
- RBAC-driven post-login redirect, forbidden page, redirect-back
- Device/session records + "sign out from all devices"
- Suspicious-login detection, audit logs, rate limit + CAPTCHA-after-abuse
- Nafath adapter stub (interface only, clearly `not_configured`)
- Test suite (unit + e2e) covering auth, session, RBAC, RLS

Out (documented, not built here):
- `@supabase/ssr` HttpOnly cookies (kept on localStorage per your choice)
- Real Nafath integration
- Any redesign of `/patient`, `/admin`, doctor workspace themselves

## Routes

| Route | Purpose |
|---|---|
| `/auth/login` | Phone/NationalID/email tabs; issues OTP or password flow |
| `/auth/register` | Patient self-registration + phone verification |
| `/auth/verify` | OTP entry — expiry, resend countdown, max attempts |
| `/auth/recovery` | Password reset + phone recovery |
| `/auth/update-mobile` | Signed-in mobile change with OTP on new number |
| `/auth/session-expired` | Landing when middleware detects expired/rotated session |
| `/forbidden` | Accessible 403 with role hint + "return to safe area" |

Existing `/auth` becomes a redirect to `/auth/login` so old links keep working (`_authenticated/route.tsx` currently redirects there).

## Redirect matrix

```text
patient        → /patient
staff/admin    → /admin
doctor         → /doctor/workspace (existing route if present, else /admin)
super_admin    → /admin
unknown/none   → /forbidden
```

- All protected routes push `?next=<sanitized same-origin path>` to `/auth/login`.
- After login, we validate `next` (same-origin, not `/auth/*`) then `navigate({ to: next, replace: true })`.
- `_authenticated/route.tsx` already gates the subtree; we only extend its redirect target with `next` and add role-based redirect on `/` post-login.

## Data model

New tables (all with GRANTs + RLS in same migration):

- `patient_profiles(user_id PK→auth.users, national_id, iqama, mobile_e164, mobile_verified_at, full_name_ar/en, dob, gender, preferred_language, mrn, …)`
- `staff_profiles(user_id PK, employee_no, department, job_title, hire_date, active)`
- `doctor_profiles(user_id PK, doctor_id→doctors.id, license_no, specialty_id, active)`
- `otp_challenges(id, user_id nullable, channel {whatsapp,email}, destination, code_hash, salt, purpose {login,register,recovery,mobile_change}, attempts, max_attempts, expires_at, consumed_at, ip inet, ua)` — never stores plaintext
- `device_sessions(id, user_id, session_fingerprint, ua, ip, city, first_seen_at, last_seen_at, revoked_at, revoke_reason)`
- `auth_events(id, user_id nullable, kind {login_ok,login_fail,otp_send,otp_fail,rate_limited,suspicious,logout,logout_all,role_denied}, ip, ua, meta jsonb, created_at)`
- `auth_rate_limits(key text PK, window_started_at, hits)` — server-side counter for phone/IP

Backfill: one-shot migration copies matching columns from `profiles` into `patient_profiles` for every user without a staff/doctor role. `profiles` is kept (used by many surfaces) and a DB trigger keeps `full_name` in sync during transition.

RLS:
- Owner-only SELECT/UPDATE on all three `*_profiles` (`auth.uid() = user_id`)
- `staff_profiles` / `doctor_profiles` additionally readable by `admin`/`super_admin` via `has_role`
- `otp_challenges`, `device_sessions`, `auth_events`, `auth_rate_limits`: no anon/authenticated grants; only `service_role`. All access via server functions.

## OTP (WhatsApp, real)

Reuses the notifications pipeline that already writes to `notification_delivery_logs` and integrates with the project's WhatsApp provider.

- `otp.issueChallenge`: mint 6-digit code, store **HMAC-SHA256(code+salt)** with per-row salt using server secret `AUTH_OTP_PEPPER` (generated via `generate_secret`), send via WhatsApp helper, log delivery, insert `otp_challenges` row with `expires_at = now()+5m`, `max_attempts=5`.
- `otp.verify`: constant-time compare, increment attempts, atomic consume; on success create Supabase session (magic link exchange for known email) or sign in via existing custom flow.
- Resend: server-side 60s cooldown per destination.
- Rate limit: per-phone 5/hour, per-IP 20/hour; on breach → `rate_limited` + require CAPTCHA (hCaptcha invisible; secret `HCAPTCHA_SECRET` requested only if you approve).
- CAPTCHA required after 3 failed attempts within 15m for that destination or IP.
- No plaintext OTP anywhere: logs record only the last-2 digits + hash prefix for support.

## Nafath adapter (stub)

`src/lib/auth/nafath.ts` exposes `initiate()` / `poll()` returning `{ status: "not_configured" }` and the login UI shows Nafath as "قريبًا" (disabled). No fake success paths.

## Sessions & devices (on localStorage session)

- Every successful login inserts `device_sessions` keyed by a fingerprint (UA + salted-IP hash) and `access_token`'s `session_id` claim.
- Root `onAuthStateChange` subscriber updates `last_seen_at` on `TOKEN_REFRESHED`.
- `Sign out everywhere`: server fn calls `auth.admin.signOut(userId, { scope: 'global' })` and marks all `device_sessions` revoked. Current tab receives `SIGNED_OUT` via the existing subscriber.
- Suspicious-login detection: new IP country **or** new UA family within 24h → row in `auth_events(kind='suspicious')` + WhatsApp notification to owner + forces re-OTP on next privileged action.
- `session-expired` route: shown when router catches a 401 from a protected server fn (add error boundary hook in `_authenticated/route.tsx`).

## RBAC

- `user_roles` stays authoritative (`app_role` enum extended if needed: `patient`, `doctor`, `staff`, `admin`, `super_admin`, `content_manager`).
- Auth context in root route exposes `hasRole` / `hasAnyRole` (already partly wired). Post-login redirect uses server fn `resolveHomeForUser()` — never trusts the client role claim.
- `/forbidden` shows the denied role, the required role, and links back.

## Files to add / change

- New: 7 route files under `src/routes/auth.*.tsx` + `src/routes/forbidden.tsx`
- New: `src/lib/auth/otp.functions.ts`, `session.functions.ts`, `devices.functions.ts`, `redirect.ts`, `nafath.ts`, `captcha.server.ts`
- New: `src/components/auth/*` (PhoneField, OtpInput, ResendCountdown, DeviceList, LoginTabs)
- Change: `src/routes/auth.tsx` → thin redirect to `/auth/login`
- Change: `src/routes/_authenticated/route.tsx` — add `next` param, keep `ssr:false`
- Change: `src/routes/__root.tsx` — hook `SIGNED_OUT` → `/auth/session-expired`
- One migration for the 4 new tables + backfill + RLS + grants
- Secret: `AUTH_OTP_PEPPER` via `generate_secret`; `HCAPTCHA_SECRET` via `add_secret` only after you confirm

## Tests

- Unit: OTP issue/verify (expiry, max attempts, constant-time), rate limiter, redirect sanitizer, `resolveHomeForUser`
- E2E (Playwright): patient WhatsApp OTP happy path, wrong-code lockout, resend cooldown, staff email/password → `/admin`, doctor → workspace, unknown-role → `/forbidden`, redirect-back to originally requested URL, session-expired flow, logout-all
- RLS: `test_role_access_matrix` extended for the 3 new profile tables + `otp_challenges` (must be inaccessible to anon/authenticated)
- Security: OTP row must never contain plaintext (schema+test); no server fn logs the code

## Rollout order (single turn, in this order)

1. Migration (tables + RLS + backfill) — awaits your approval before running
2. Server fns for OTP / sessions / devices / redirect resolver
3. Route files + components
4. Wire existing `/auth` redirect + `_authenticated` `next` param
5. Add tests, run typecheck + tests
6. Deliver a change manifest and remaining blockers (WhatsApp provider env, HCAPTCHA opt-in, HttpOnly-cookie follow-up)

## Assumptions to confirm implicitly

- WhatsApp provider is reachable from server fns today (used by notifications). If not, OTP send returns `provider_unavailable` and the UI shows an error — never a fake success.
- Doctor workspace route path — I'll pick `/doctor/workspace` and add a minimal placeholder if it doesn't exist; you can rename later.
