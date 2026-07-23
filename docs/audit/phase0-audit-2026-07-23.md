# Phase 0 — Full System Audit
**Baeshen Medical Center · Team Hamed · 2026-07-23**

> **قيد الفحص فقط — لا migrations، لا تغييرات auth/payment/medical/RLS في هذه المرحلة.**
> This is a read-only audit. All fixes are proposed in the Change Manifest and Backlog, not executed.

---

## 1) File Inventory

| Layer | Files |
|---|---:|
| `src/routes/_authenticated/**` | 115 |
| `src/lib/**` (top-level + subfolders) | ~140 |
| `src/routes/**` (top-level + api) | ~90 |
| `src/components/**` | ~155 |
| `src/hooks/**` | 7 |
| `src/integrations/supabase` | 5 |
| Generated (`types.ts`, `routeTree.gen.ts`) | 2 (11 575 lines combined) |
| **Total `src/`** | **~613** |

**Largest hand-written files (line count):**
- `src/routes/_authenticated/admin.classic.tsx` — **4 716** (legacy monolithic admin dashboard, kept for `/admin?tab=X` back-compat)
- `src/routes/_authenticated/patients-analytics.tsx` — 2 368
- `src/routes/doctors.$slug.tsx` — 2 055
- `src/routes/_authenticated/portal.refunds.tsx` — 1 767
- `src/lib/admin.functions.ts` — 1 523
- `src/components/IntroOverlay.tsx` — 1 386
- `src/components/PushSubscriptionCard.tsx` — 1 166

**Asset flags:** three near-duplicate hero images (`baeshen-hero-complex.jpg` 1.1 MB, `-warm.jpg` 5.1 MB, `-cool.jpg` 5.0 MB) — only referenced via `.asset.json` manifests, needs bundler trace before removal.

---

## 2) Route Inventory

- **Public top-level routes:** 55 head()-eligible pages · **53/55 declare `head()`**.
  - Missing head: `reservations.new.tsx` (redirect stub — Low), `[.]lovable.oauth.consent.tsx` (OAuth screen, intentional).
- **`_authenticated/` routes:** 115 files. Real head() gaps (7): `admin.realtime-monitor.tsx`, `clinic-settings.tsx`, `command-center.tsx`, `my.tsx`, `portal.audit-log.tsx`, `rbac-audit.tsx`, `report-downloads-audit.tsx`, `settings.tsx`.
- **Split-bundle admin shell (intentional, not duplicates):** `admin.tsx` (guard/loader) → `admin.lazy.tsx` (lazy `AdminShellV2`) → `admin.classic.tsx` (legacy, back-compat) + `admin.v3.tsx` (V3 rollout page).
- **Naming sprawl (product decision, not code dup):** five separate "audit" surfaces — `audit-log`, `audit-export`, `portal.audit-log`, `rbac-audit`, `report-downloads-audit`.
- **No orphaned route files** (every `.tsx` under `routes/` is registered in `routeTree.gen.ts`).

---

## 3) Service Inventory

**Server functions (`src/lib/**/*.functions.ts`) — ~479 exports across ~100 files.** Grouped by guard pattern:

| Guard | Where | Coverage |
|---|---|---|
| `requireSupabaseAuth` middleware | `src/integrations/supabase/auth-middleware.ts:34` | Base gate for `portal/*`, `patients`, `doctors`, `notifications`, `rbac`, `calendar` — all authenticated user actions. |
| `assertConsoleAccess` (admin ∪ super_admin via `has_role` RPC) | `src/lib/admin/_guard.ts:14` | `admin/global-search`, `admin/notifications-feed`. |
| `assertHasRole(role="admin")` — ad-hoc helper duplicated per module | `src/lib/admin/service-inquiries.functions.ts:12` + copies in `admin/booking-trace`, `admin/services-health` | Admin-only booking trace & service inquiries. **DRY smell:** should consolidate into `_guard.ts`. |
| `assertOwnerOnly` / `assertContentAccess` / `assertAAL2` (MFA) | `src/lib/owner/_access.ts:14-55` | Site Builder (pages/services/media/settings/accounts/permissions/audit). Destructive ops require `super_admin` + AAL2. |
| Inline `getRoles()` post-auth string check | `src/lib/rbac.functions.ts:34,214-217,382-385,454-456` | RBAC self-service surfaces. |
| **Unguarded (flag)** | `src/lib/admin/no-show-*.functions.ts` (risk/stats/detail/visual), plus parts of `admin.functions.ts` >L1500 | **Needs direct read to confirm** — see Backlog H-3. |

**Server routes (`src/routes/api/**`):**
- Non-public: `api/admin/ai-chat.ts` (bearer + `has_role` admin/super_admin, verified), `api/ai/action.ts`, `api/ai/chat.ts`, `api/portal/ai-chat.ts` (guards unverified — Backlog H-3).
- Public: 28 files under `api/public/**` — see §2 flags below.

---

## 4) Database Map (106 tables, from `supabase/types.ts`)

| Domain | Tables |
|---|---|
| Booking/Scheduling | `appointments`, `appointment_audit`, `appointment_ref_daily_counter`, `appointment_status_history`, `appointment_waitlist`, `availability`, `availability_slots`, `slot_holds`, `doctor_leaves`, `booking_trace_events`, `reservation_manage_events`, `guest_reservation_sessions` |
| Patient | `patients`, `patient_allergies`, `patient_attachments`, `patient_check_ins`, `patient_immunizations`, `patient_medical_history`, `patient_medications`, `patient_qr_scans`, `patient_ratings`, `patient_stories`, `patient_surgeries`, `patient_visits`, `dependents`, `consent_records` |
| Doctor/HR | `doctors`, `doctor_branches`, `nurses`, `nurse_calls`, `nurse_shifts`, `employees`, `attendance_records`, `leave_requests`, `payroll_items`, `payroll_runs` |
| Clinical | `medical_reports`, `report_versions`, `lab_reports`, `radiology_reports`, `prescriptions`, `second_opinion_requests` |
| Billing/Insurance | `invoices`, `payments`, `refunds`, `insurance_approvals`, `insurance_verifications`, `insurance_providers`, `purchase_requests`, `purchase_request_items`, `nphies_requests` |
| Pharmacy/Inventory | `medicine_orders`, `inventory_items`, `stock_movements`, `home_care_requests` |
| CMS | `about_sections`, `accreditations`, `custom_pages`, `faqs`, `health_articles`, `health_categories`, `intro_settings`, `media_library`, `message_templates` |
| Ops/Admin | `branches`, `branch_excellence_centers`, `excellence_centers`, `clinic_settings`, `system_settings`, `service_catalog`, `service_inquiries`(+attachments/counter/updates), `complaints`, `corporate_requests`, `deployment_markers`, `rollback_recommendations`, `transition_alert_rules`, `integration_logs` |
| AI | `ai_conversations`, `ai_messages`, `ai_feature_flags`, `ai_model_routes`, `ai_prompt_versions`, `ai_safety_incidents`, `ai_stream_events`, `ai_tool_invocations`, `ai_usage_costs`, `mcp_tool_invocations` |
| Reports/Perf | `web_vitals`, `api_permission_errors`, `reminder_preferences`, `reminder_preference_audit` |
| Security/RBAC | `audit_logs`, `security_audit_log`, `user_roles`, `role_permissions`, `permissions`, `user_resource_permissions`, `profiles`, `push_subscriptions`, `notifications`, `notification_delivery_logs` |

`doctor_branches` join table exists but is deferred (per project memory) — `doctors.branch_id` remains single-source.

---

## 5) Authentication Map

```
Browser  →  supabase.auth (client)  →  Bearer JWT
   ↓                                        ↓
_authenticated/route.tsx.beforeLoad     start.ts.functionMiddleware
   ↓                                        ↓
redirect(/auth) if !user            attachSupabaseAuth → Authorization header
                                            ↓
                              requireSupabaseAuth middleware
                              (validates + injects {supabase,userId,claims})
                                            ↓
                              per-module role assertion
                              (assertConsoleAccess | assertHasRole
                               | assertOwnerOnly/ContentAccess/AAL2
                               | inline getRoles())
                                            ↓
                              Postgres RLS (RPC / table policies)
```

- **Session hydration:** `src/routes/_authenticated/route.tsx:12-18`.
- **Server-fn bearer bridge:** `src/integrations/supabase/auth-attacher.ts` registered in `src/start.ts`.
- **`user_roles` table** is the sole source of truth; `has_role` SECURITY DEFINER RPC avoids recursive RLS.

---

## 6) Permission Matrix

**Canonical roles (`src/lib/rbac.functions.ts:6-21`):**
`super_admin, admin, center_admin, branch_manager, doctor, reception, pharmacy, reports_officer, billing_officer, insurance_officer, support_agent, content_manager, auditor, patient`.

**Drift observed** (referenced in code but not in canonical enum): `owner`, `nurse`, `hr`, `staff`.

| Role | Unlocks | Evidence |
|---|---|---|
| `super_admin` | Full console; only role that can delete in Site Builder; AAL2 for destructive ops; always passes `RequirePermission` | `_guard.ts:12`, `owner/_access.ts:5,51-54`, `RequirePermission.tsx:55,61` |
| `admin` | Full admin console (CONSOLE_ROLES); most `admin/*` mutations | `admin/_guard.ts:12` |
| `content_manager` | CMS: pages, services, media, settings (no delete) | `owner/_access.ts:5-7,36-44` |
| `doctor` | Portal/clinical features scoped to own patients | `rbac.functions.ts:11`; DB FKs |
| `patient` | Portal (own records, appointments, invoices, consents) | RLS columns; public OTP endpoints |
| others | Declared but per-feature mapping not traced end-to-end | Backlog M-2 |

Fine-grained permissions (`doctors.manage`, `system.monitor`, `rbac.manage`, `settings.manage`, `patients.view`) live in `permissions`/`role_permissions` and gate specific admin pages via `RequirePermission anyOf=...`. UI gate only — server functions must independently re-check role.

---

## 7) Broken Links & Non-Functional Buttons Report

- **No broken `<Link to>` / `navigate()` targets found.** 76 unique targets, all resolve to existing route files.
- **No `href="#"` or empty `onClick={() => {}}`** across `src/**/*.tsx`.
- `reservations.new.tsx` is a deliberate legacy redirect stub (not broken).
- **Verdict:** clean.

---

## 8) Security Findings

### 8.1 Scanner state (auto-updated by `security--*` tools)
- `agent_security`: **0 findings** (all previous OTP dev-echo / cron anon-key issues fixed).
- `supabase_lov`: **3 warns** (still open by design):
  - `appointments_public_slot_holds_pii` — Realtime `slot_holds` exposes `doctor_id/session_id` to anon. **Medium.**
  - `availability_slots_realtime_appointment_linkage` — Realtime aggregate leaks operational patterns. **Medium.**
  - `service_catalog_conflicting_editor_policies` — Informational, no action.
- `supabase--linter`: **112 warnings**
  - 1 × Extension in Public.
  - 34 × `SECURITY DEFINER` executable by **anon**.
  - 77 × `SECURITY DEFINER` executable by **signed-in users**.
  - Confirmed subset intentional (booking RPC, OTP, has_role); balance needs a triage pass — Backlog H-1.

### 8.2 Application-level findings

| # | Severity | Finding | Evidence |
|---|---|---|---|
| S-1 | **High** | `admin/no-show-*.functions.ts` handlers show no visible `assertHasRole`/`assertConsoleAccess` in grep sample — potential unguarded admin data. Needs direct read of every handler. | `src/lib/admin/no-show-risk.functions.ts:53`, `no-show-stats.functions.ts:69,241,254`, `no-show-detail.functions.ts:49`, `no-show-visual.functions.ts:75` |
| S-2 | **Medium** | `api/ai/*` and `api/admin/ai-chat.ts` (partial), `api/portal/ai-chat.ts`, `api/public/reservations/session-from-auth.ts` auth model unverified. | see files |
| S-3 | **Medium** | Public booking availability endpoints validate params via manual regex, not zod. | `api/public/book/{availability,month-availability,resolve-any-doctor}.ts` |
| S-4 | **Medium** | `api/public/hooks/web-vitals.ts` no rate-limit + open CORS → log-flood risk. | file:38-40 |
| S-5 | **Medium** | `api/public/media/$.ts` no rate-limit on file downloads → bandwidth abuse risk (content itself is registered public media). | file:18-31 |
| S-6 | **Low** | Cron hooks (permission-watchdog, record-deployment, v3-rollback-watchdog, send-reminders) — no zod schema (secret-gated; defense-in-depth only). | files |
| S-7 | **Low** | `book/cancel.ts` rate-limits by IP only, not by phone — limited enumeration if IP rotated. | file:26-33 |
| S-8 | **Low** | Ad-hoc `assertHasRole` re-implementations across `admin/service-inquiries`, `admin/booking-trace`, `admin/services-health` — DRY violation, drift risk. | files |

---

## 9) UX & Accessibility Findings

| # | Severity | Finding | Files |
|---|---|---|---|
| A-1 | **Medium** | Duplicate `<main>` landmark on `/doctors`: global `<main>` in `__root.tsx:227` + nested `<main>` in `doctors.index.tsx:364`. | 2 files |
| A-2 | **Medium** | Icon-only buttons missing `aria-label` — base primitive `components/ui/calendar.tsx` (wide blast radius); owner screens `owner.pages.$id.tsx`(×2), `owner.pages.index.tsx`(×3), `owner.services.$id.tsx`(×1), `owner.services.index.tsx`(×2). | 5 files |
| A-3 | **Medium** | Missing head() (tab title / share preview) on 7 authenticated pages: `admin.realtime-monitor`, `clinic-settings`, `command-center`, `my`, `portal.audit-log`, `rbac-audit`, `report-downloads-audit`, `settings`. | 7 files |
| A-4 | **Medium** | Hardcoded Arabic error/toast fallback strings bypass i18n (Arabic leaks to EN locale). | `portal.index.tsx:155`, `admin.index.tsx:506`, `reservations.manage.tsx:359,406` |
| A-5 | **Low** | Loading/empty/error states inconsistent — `reservations.manage.tsx` is the gold standard; `doctors.index.tsx` / `health.index.tsx` push failures to route-level `errorComponent` (needs verification the fallback UI is user-friendly). | multiple |
| A-6 | **Low** | OAuth consent screen renders two `<main>` elements. | `[.]lovable.oauth.consent.tsx` |

---

## 10) Performance & SEO Findings

| # | Severity | Finding |
|---|---|---|
| P-1 | **Medium** | Three near-duplicate hero images totalling ~11 MB (`baeshen-hero-complex{,-warm,-cool}.jpg`). Verify all three are still served; drop unused variants or generate `webp`/`avif`. |
| P-2 | **Medium** | Homepage widget library `src/components/home/*` (10 files: `HeroComplex`, `HeroSlider`, `AppPromo`, `AwardsMarquee`, `CentersStrip`, `NewsStrip`, `PatientJourney`, `ServicesBento`, `StatsBar`, `WhyChooseUs`) — **zero references in current `routes/index.tsx`**; still bundled by build ⇒ dead-weight in tree-shaking envelope. |
| P-3 | **Medium** | `admin.classic.tsx` = 4 716 lines. Users hitting `/admin?tab=X` back-compat still pull the whole legacy dashboard. Retire after telemetry-verified zero-traffic. |
| P-4 | **Low** | 10 unused shadcn primitives in `components/ui` (`aspect-ratio`, `context-menu`, `hover-card`, `input-otp`, `menubar`, `navigation-menu`, `radio-group`, `resizable`, `slider`, `toggle-group`). |
| P-5 | **Low** | `IntroOverlay.tsx` (1 386 lines) and `PushSubscriptionCard.tsx` (1 166) are candidates for splitting/lazy-loading. |
| SEO-1 | **Low** | 7 authenticated pages missing head() metadata (see A-3). |
| SEO-2 | **Info** | robots.txt & dynamic sitemap.xml are well-scoped; JSON-LD medical schema present; canonical/og standardized. Fresh SEO scan recommended — see closing action. |

---

## 11) Build & Test Results

**Not executed in this Phase 0** (per the "no destructive/high-risk" constraint and the harness policy that builds/typechecks are triggered by the platform). Signals gathered statically:

- **TypeScript hygiene:**
  - **987 `any` usages** across `src/`, concentrated in `admin.classic.tsx` (44), `admin.functions.ts` (44), `rbac.functions.ts` (38), `patients-analytics.functions.ts` (34), `portal/reports.functions.ts` (28), `rbac.tsx` (25), `quick-add.tsx` (23), `patients.$patientId.tsx` (22), `audit-export.functions.ts` (22), `admin/services-health.functions.ts` (22).
  - `@ts-ignore` / `@ts-expect-error`: **0** (clean).
  - `eslint-disable`: **167** total occurrences (not itemized).
- **Test surface (present in `tests/`):**
  - Unit: `tests/unit/*` (booking, docs, share/timezone, i18n).
  - RLS: 30+ `tests/rls/*.ts` covering appointments, audit, reminder-preferences, notes, transitions.
  - Security: `tests/security/*.py` (grants pinned, role-access matrix, doctors CRUD, SECDEF privileges, rollback-drill).
  - E2E (Playwright): booking flows, portal redesign, admin redirects, doctors CRUD, cancel/reschedule/waitlist fixtures, notification chips, correlation/BMC-reference.
  - a11y baseline: `tests/a11y/axe_baseline.py` produces JSON/MD reports.
  - Visual regression: `tests/visual/portal_visual_regression.py`.
- **CI/husky:** pre-push RLS check, portal-tokens lint (baseline JSON), perf-budget script, compare-CI helpers.
- **Recommendation:** run `bun run typecheck`, `bun run lint`, `bun run test:react`, `bun run check:rls` at the start of Phase 1 to lock a green baseline before touching code.

---

## 12) Prioritized Backlog

### Critical (0)
_None — the last agent_security scan is clean and no unguarded PII path is confirmed. `S-1` is elevated to High until direct verification demotes/promotes it._

### High
- **H-1** Triage 112 supabase-linter `SECURITY DEFINER` warnings — classify each function as (a) intentionally anon-callable (has_role, booking RPC, OTP verify), (b) authenticated-only (revoke anon EXECUTE), (c) admin-only (revoke authenticated EXECUTE). Land tightening migration.
- **H-2** Consolidate `assertHasRole` copies into `src/lib/admin/_guard.ts` and re-import across `admin/service-inquiries`, `admin/booking-trace`, `admin/services-health` (fixes S-8, prevents drift).
- **H-3** Direct-read audit of `src/lib/admin/no-show-*.functions.ts` + all `api/ai/*` and `api/portal/ai-chat.ts` + `api/public/reservations/session-from-auth.ts` — confirm each has an appropriate guard; add missing guards.
- **H-4** Tighten Realtime visibility on `slot_holds` / `appointments` (mitigate the 2 `supabase_lov` warns): column-level GRANT restrictions + Realtime publication filter.

### Medium
- **M-1** Add zod validation to `book/availability.ts`, `book/month-availability.ts`, `book/resolve-any-doctor.ts` (S-3).
- **M-2** Add rate-limit to `hooks/web-vitals.ts` and `media/$.ts` (S-4, S-5).
- **M-3** Deep-role mapping: trace each canonical role (`center_admin`, `branch_manager`, `reception`, `pharmacy`, `reports_officer`, `billing_officer`, `insurance_officer`, `support_agent`, `auditor`) to concrete route/feature guards; either wire them into `RequirePermission` or remove from `ROLES` if unused.
- **M-4** Fix duplicate `<main>` on `/doctors` (A-1).
- **M-5** Add `aria-label` to icon-only Buttons in `components/ui/calendar.tsx` + 4 owner pages (A-2).
- **M-6** Add `head()` to 7 authenticated pages (A-3, SEO-1).
- **M-7** Replace hardcoded Arabic fallbacks with `t()` in `portal.index.tsx`, `admin.index.tsx`, `reservations.manage.tsx` (A-4).
- **M-8** Optimize / prune hero images (P-1); introduce webp/avif responsive sources.
- **M-9** Dead-code sweep for `src/components/home/*` (10 files, P-2), verify via bundle-analyzer, then delete + purge orphan hero assets.
- **M-10** Rate-limit `book/cancel.ts` by phone in addition to IP (S-7).

### Low
- **L-1** Remove unused shadcn primitives (P-4).
- **L-2** Delete/consolidate zero-reference components: `ChatbotBubble`, `WhatsAppFab`, `WelcomeSplash`, `LanguageSwitcher`, `MotionToggle`, `motion/PageTransition`, `portal/ComingSoon`, `admin/v2/DataTableV2` (after product confirms superseded).
- **L-3** Split `IntroOverlay.tsx` and `PushSubscriptionCard.tsx` for lazy-loading (P-5).
- **L-4** Add zod schemas to cron hooks (S-6) — defense-in-depth.
- **L-5** Retire `admin.classic.tsx` after telemetry proves `/admin?tab=X` traffic is negligible (P-3).
- **L-6** Fix double `<main>` in `[.]lovable.oauth.consent.tsx` (A-6).
- **L-7** Rename/collapse 5-way "audit" route surfaces into a single admin audit hub with sub-tabs (product decision).

---

## 13) Change Manifest — Phase 1 Proposal

> **قيد الاعتماد — لن نبدأ التنفيذ حتى موافقة المهندس حامد.** Batches ordered by risk (low → high), each independently rollback-able.

### Batch 1 — Cosmetic & Non-Functional (Zero-Risk)
- **B1-1** Add `head()` metadata (title/desc/og) to 7 authenticated pages (M-6).
- **B1-2** Replace 4 hardcoded Arabic fallbacks with `t()` keys + add ar/en/ur strings (M-7).
- **B1-3** Fix duplicate `<main>` on `/doctors` (M-4).
- **B1-4** Add `aria-label` to 9 icon-only Buttons across `ui/calendar.tsx` + owner pages (M-5).
- **B1-5** Fix double `<main>` in OAuth consent screen (L-6).

**Rollback:** git revert per commit; no data or schema touched.

### Batch 2 — Dead-Code Sweep (Low-Risk)
- **B2-1** Delete 10 unused shadcn primitives (L-1) — verify with `tsgo` + build.
- **B2-2** Delete 8 zero-reference components (L-2) after product sign-off — verify.
- **B2-3** Delete `src/components/home/*` (10 files, P-2/M-9) + orphan hero image variants — verify via bundle output.
- **B2-4** Split `IntroOverlay.tsx` / `PushSubscriptionCard.tsx` into lazy chunks (L-3, P-5).

**Rollback:** git revert per commit; assets restorable from history.

### Batch 3 — Public API Hardening (Low-Risk)
- **B3-1** Migrate 3 booking availability endpoints from manual regex → zod (M-1).
- **B3-2** Add `applyRateLimit` to `hooks/web-vitals.ts` and `media/$.ts` (M-2).
- **B3-3** Add zod schemas to 4 cron hooks (L-4).
- **B3-4** Add phone-based rate-limit to `book/cancel.ts` (M-10).

**Rollback:** git revert per file; endpoints revert to previous validation.

### Batch 4 — Server-Function Guard Consolidation (Medium-Risk)
- **B4-1** Consolidate `assertHasRole` copies into `_guard.ts` (H-2).
- **B4-2** Direct-read + add missing guards to `admin/no-show-*.functions.ts` and unverified `api/ai/*` / `api/portal/ai-chat.ts` / `api/public/reservations/session-from-auth.ts` (H-3, S-1, S-2).
- **B4-3** Add unit tests per-handler proving unauthenticated / non-admin callers are rejected (pattern from `tests/unit/admin-service-inquiries-role-guard.test.ts`).

**Rollback:** git revert per commit; existing behavior preserved by keeping the ad-hoc helpers in place until B4-3 tests green.

### Batch 5 — DB Privilege Tightening (Higher-Risk — Deferred to explicit approval)
- **B5-1** Land supabase-linter triage migration reducing anon/authenticated EXECUTE surface (H-1). **Requires a per-function table + review before writing SQL.**
- **B5-2** Tighten Realtime `slot_holds`/`appointments` publication (H-4).

**Rollback:** each migration paired with a paired `down.sql` re-granting EXECUTE and re-adding Realtime rows. Full drill via `tests/security/test_rollback_drill_e2e.py`.

### Batch 6 — Role-Model Cleanup (Medium-Risk)
- **B6-1** Reconcile 4 drift roles (`owner`, `nurse`, `hr`, `staff`) — either add to canonical enum or remove usages.
- **B6-2** Map every canonical role to its feature surface; wire missing `RequirePermission` guards or drop unused roles (M-3).

**Rollback:** git revert; no schema changes if only code guards are added.

---

## 14) Rollback Plan

- **Code-only batches (B1–B4, B6):** every batch lands as its own git branch → PR → merge. `git revert <sha>` restores previous state. Preview URL and published URL are separate deployments; a bad merge affects preview first, giving a checkpoint before publishing.
- **DB migrations (B5):** each migration ships with a paired **down migration** (re-GRANT EXECUTE, re-INSERT Realtime rows) and is executed only after:
  1. `supabase--linter` shows the migration removed exactly the intended warns.
  2. `tests/security/test_role_access_matrix.py` and `tests/rls/*.ts` pass.
  3. `tests/security/test_rollback_drill_e2e.py` demonstrates a clean forward+backward cycle in staging.
- **Feature flags:** `src/lib/v3/flags.functions.ts` + `src/lib/v3/rollback.functions.ts` + the existing `v3-rollback-watchdog` cron are available for any Phase 1 feature that ships behind a flag; the watchdog auto-flips flags off on error-rate spikes (`admin.v3.tsx`).
- **Deployment markers:** every batch writes a row to `public.deployment_markers` (already wired via `api/public/hooks/record-deployment.ts`) so the admin can pinpoint the deploy that introduced a regression.
- **Observability:** `admin.services-health.tsx`, `admin.web-vitals.tsx`, `admin.ai-streaming.tsx`, `admin.realtime-monitor.tsx` are the primary dashboards to watch for 15 min post-deploy per batch.

---

## Appendix — Open Questions (must resolve before starting Phase 1)

1. Confirm each `admin/no-show-*.functions.ts` handler's actual guard (grep-only sample was inconclusive).
2. Confirm auth model of `api/ai/*`, `api/portal/ai-chat.ts`, `api/public/reservations/session-from-auth.ts`.
3. Trace whether the three hero image variants (`-warm`, `-cool`) are still served or dead assets.
4. Product decision on retirement of `admin.classic.tsx` (traffic telemetry needed).
5. Product decision on collapsing 5-way "audit" surfaces.
6. Read actual Postgres `CREATE POLICY` statements from `supabase/migrations/**` to confirm RLS matches the `types.ts`-inferred column signals.
