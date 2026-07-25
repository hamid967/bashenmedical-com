# Phase 12 — Threat Model & Security Hardening (Bashen Medical)

_Owner: فريق حامد — Security._
_Last updated: 2026-07-24._
_Scope: entire platform (public site, Patient Portal, Admin Console, AI
Assistant, Booking API, CMS, integrations)._

> This document is **not** a certification. It records the controls implemented
> across Phases 0–11, catalogues attack surfaces per **STRIDE**, and enumerates
> **residual risks** that must be addressed by an independent penetration test
> before production launch.

---

## 1. System overview

| Layer             | Runtime                              | Data of concern                                  |
| ----------------- | ------------------------------------ | ------------------------------------------------ |
| Public site (SSR) | TanStack Start on Cloudflare         | Marketing, doctors, service catalogue            |
| Patient Portal    | Same, gated by `_authenticated`      | PHI (appointments, reports, medications, family) |
| Admin Console     | Same, gated by RBAC hubs             | Ops data, PII, staff profiles, audit logs        |
| Booking (public)  | `/api/public/book/*` server routes   | Session-owned draft bookings, contact PII        |
| AI Assistant      | Streaming server fn + SSE            | Conversational PII (masked), staff tools         |
| Backend           | Supabase (Postgres + Auth + Storage) | All persistent data                              |

Trust boundaries: **anon → authenticated (patient) → staff role → admin → super_admin**. Every crossing enforces RLS + `assertHasRole()` + audit event.

---

## 2. STRIDE per attack surface

### 2.1 Public booking (`/api/public/book/*`, `/reservations/manage`)

| Threat class    | Vectors                                 | Controls                                                                                               |
| --------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Spoofing        | Fake identity on hold/create            | OTP verification, `session_id` cookie bound to `slot_holds`, Idempotency-Key                           |
| Tampering       | Client-supplied `owner_id`, price, slot | Server derives owner from bearer or session; Zod validation on every field; atomic RPC transactions    |
| Repudiation     | "I did not book this"                   | `booking_trace_events` immutable log; `reservation_manage_events` per action                           |
| Info disclosure | Enumerate other holds/appointments      | Column-level GRANT on `slot_holds`; `held_by_user_id = auth.uid()` policy; guest holds are server-only |
| DoS             | Slot-hold storm                         | `rate-limit.server.ts` on `/hold` and `/inquiries/create`; DB unique key prevents duplicate holds      |
| Elevation       | Turn a guest hold into an admin action  | No admin endpoint accepts a session cookie; every admin fn calls `assertHasRole`                       |

### 2.2 Patient Portal (`_authenticated/patient/*`)

| Threat        | Controls                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| IDOR          | Every `.eq('patient_id', auth.uid())` filter is redundant to RLS but kept as defense-in-depth. `family_member_id` scoped via `dependents`. |
| Broken access | Managed `_authenticated/route.tsx` gate + `requireSupabaseAuth` on every server fn. Staff/admin cannot read patient rows via portal fns.   |
| XSS           | All content rendered through React. `dangerouslySetInnerHTML` only in whitelisted CMS blocks after DOMPurify sanitize.                     |
| CSRF          | Same-origin server fns rely on bearer, not cookies. Public API routes are POST + JSON + Origin check when a session is involved.           |
| SSRF          | No user-supplied URL is fetched server-side except signed-URL storage reads through Supabase Storage.                                      |
| Session fix.  | Supabase rotates access + refresh tokens on every refresh; sign-out clears cache + REPLACE navigation (see `tanstack-auth-guards`).        |

### 2.3 Admin Console (`_authenticated/admin.*`)

| Threat              | Controls                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Priv escalation     | Roles live only in `public.user_roles`; `has_role()` is SECURITY DEFINER with pinned `search_path`. Client role hints are decorative.                   |
| Broken access       | `assertHasRole('admin'                                                                                                                                  | 'super_admin')`at the top of every admin server fn; unauthorized access writes`security_audit_log`. |
| Unauthorized export | CSV export server fns re-check role and log an `audit_logs` row per export (channel, count, filters).                                                   |
| Cross-patient       | Admin RLS policies scoped by `branch_id` when the role is branch-scoped (see role_permissions_matrix).                                                  |
| Immutability        | `audit_logs`, `security_audit_log`, `booking_trace_events`, `inbox_events` have INSERT-only policies for their writer role and no UPDATE/DELETE policy. |

### 2.4 AI Assistant

| Threat             | Controls                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Prompt injection   | System prompt hardened; user text is quoted with `<user_input>` fencing; tool-invocation confirmation uses HMAC-SHA256 tokens (two-phase). |
| PII leak into logs | Client-side masker before send; server-side re-mask on `ai_messages` insert; `ai_stream_events` never persists raw content.                |
| Unauthorized tools | Staff-only tools gated by `assertHasRole` inside `staff-snapshot.server.ts`; safety incidents logged to `ai_safety_incidents`.             |
| Cost abuse         | Per-user token budget + rate limit; `ai_usage_costs` table + admin dashboard.                                                              |

### 2.5 CMS & Media

| Threat            | Controls                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| File-upload abuse | `signed-url.server.ts` enforces MIME allowlist, size caps, and virus-safe extensions; storage bucket is **private**. |
| Signed-URL leak   | URLs are short-lived (15 min for reports, 60 min for media library); one URL per download event is logged.           |
| Open redirect     | `next` params are validated as **same-origin relative path** before navigation (auth flow + CMS preview).            |
| SSRF via preview  | `cms_preview_tokens` are single-use, TTL-bound, and never fetch external URLs on behalf of the caller.               |

---

## 3. Control matrix (Phase 12 requirements)

| Control                   | Status | Location                                                                                                                    |
| ------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| Secure authentication     | ✅     | Supabase Auth + WhatsApp OTP + Google OAuth via `lovable.auth.signInWithOAuth`                                              |
| RBAC + RLS                | ✅     | `public.user_roles` + `has_role()`; every table with RLS + explicit policies                                                |
| Least privilege           | ✅     | `service_role` only inside verified webhooks / admin fns; anon reads via publishable-key client + narrow SELECT policies    |
| Server-side authorization | ✅     | `src/lib/admin/_guard.ts::assertHasRole`, called in every admin server fn                                                   |
| Input validation          | ✅     | Zod on server fns and public routes                                                                                         |
| Output encoding           | ✅     | React default escaping; DOMPurify for CMS HTML                                                                              |
| Rate limiting             | ✅     | `src/lib/rate-limit.server.ts` on booking + inquiries; auth rate-limit table                                                |
| CAPTCHA                   | ⚠️     | **Residual** — hCaptcha planned for `/auth/verify` and `/inquiries/create`. Not blocking; rate-limit covers baseline abuse. |
| Secure cookies            | ✅     | Supabase SSR cookies: `HttpOnly`, `Secure`, `SameSite=Lax`                                                                  |
| Session rotation          | ✅     | Supabase rotates refresh tokens; sign-out invalidates client cache                                                          |
| IDOR protection           | ✅     | RLS + explicit `.eq('user_id', auth.uid())` defense-in-depth                                                                |
| CSRF protection           | ✅     | Bearer-token auth (not cookies) on server fns; public POST routes verify Origin when session-bound                          |
| File validation           | ✅     | `signed-url.server.ts` MIME/size checks                                                                                     |
| Private storage           | ✅     | All Supabase Storage buckets private                                                                                        |
| Signed URLs               | ✅     | TTL-bound, single-use where possible                                                                                        |
| Encryption at rest        | ✅     | Supabase-managed (AES-256); PII columns considered for `pgcrypto` in reports                                                |
| Encryption in transit     | ✅     | HTTPS-only; HSTS via Cloudflare                                                                                             |
| Secrets management        | ✅     | Lovable Cloud secrets; no secrets in repo; `.env` auto-generated only for public VITE_* vars                                |
| Dependency scanning       | ✅     | `code--dependency_scan` — 0 high/critical (2026-07-24)                                                                      |
| Secret scanning           | ⚠️     | **Residual** — recommend enabling GitHub secret scanning + gitleaks pre-commit hook                                         |
| Immutable audit logs      | ✅     | `audit_logs`, `security_audit_log`, `booking_trace_events`, `inbox_events`, `cms_audit` — INSERT-only                       |
| Backup & recovery         | ✅     | See `docs/runbooks/backup-recovery.md`                                                                                      |
| Data retention            | ✅     | See `docs/security/data-retention.md`                                                                                       |
| Incident response         | ✅     | See `docs/runbooks/incident-response.md`                                                                                    |

---

## 4. Test matrix (attack classes → tests)

See `tests/security/README.md` for the canonical index. Summary:

| Attack class          | Test artefacts                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| Broken access control | `test_authz_boundaries.py`, `test_role_access_matrix.py`                                              |
| IDOR (cross-patient)  | `test_cross_patient_idor.py` (Phase 12)                                                               |
| Authentication bypass | `tests/e2e/admin_redirect_when_not_admin.py`, `admin_opens_for_admin_user.py`                         |
| Privilege escalation  | `test_secdef_privileges.py`, `test_execute_privileges_regression.py`                                  |
| SQL injection         | All DB access through parameterized supabase-js / Postgrest — no string concat; covered by unit tests |
| XSS                   | React default escaping + DOMPurify unit test (`tests/unit/cms-sanitize.test.ts`)                      |
| CSRF                  | Bearer-only auth; server-fn integration tests assert missing bearer → 401                             |
| SSRF                  | No user-controlled server fetch — verified by code audit                                              |
| File upload           | `signed-url` unit tests assert MIME/size rejection                                                    |
| Open redirect         | Auth-flow tests assert same-origin `next` param                                                       |
| Session fixation      | Manual: sign-out drops cached refresh token (see `tanstack-auth-guards`)                              |
| Race conditions       | Booking concurrency test with `Idempotency-Key` (409 conflict path)                                   |
| Prompt injection      | `tests/security/test_prompt_injection.md` — manual matrix, automated fuzz recommended                 |
| Unauthorized export   | Admin export fns log `audit_logs`; unit test asserts non-admin gets `assertHasRole` rejection         |

---

## 5. Residual risks (require external pentest)

1. **CAPTCHA**: absent on WhatsApp OTP and public inquiries. Rate-limit protects volume, not sophistication. Recommend hCaptcha before launch.
2. **Server-side prompt injection**: LLM providers evolve; the current guard is best-effort. Adversarial red-team round is required for the AI Assistant.
3. **`extensions` schema linter warning**: `SUPA_function_search_path_mutable` remains for pgcrypto / pg_stat_statements / uuid-ossp — Supabase-managed extensions. Not fixable in application migrations; documented as accepted.
4. **Secret scanning in CI**: no automated pre-commit / CI gitleaks yet. Recommend GitHub secret scanning + gitleaks in CI.
5. **Cross-region backup restore drill**: only in-region point-in-time restore has been rehearsed. Cross-region DR drill pending.
6. **Physical security & staff device policy**: out of application scope. Requires org-level policy sign-off.
7. **Pen-test attestation**: **required** before production launch — this document is not a substitute.

---

## 6. Non-goals

- HIPAA/SOC2 certification (org-level, not covered here).
- Web Application Firewall tuning beyond Cloudflare defaults.
- DDoS surge capacity beyond Cloudflare + Supabase autoscale.

---

## 7. Change control

- All schema changes must ship a migration; RLS changes require an entry in `docs/security/permission_watchdog.md`.
- Any new server fn calling `supabaseAdmin` must be reviewed against `least privilege` in this doc.
- Any new public route under `/api/public/*` must justify authentication bypass and add signature/Origin check in the same PR.
