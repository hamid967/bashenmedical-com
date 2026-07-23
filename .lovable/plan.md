# Phase 5 — Premium Patient Portal (`/patient`)

The existing portal lives under `/_authenticated/portal.*` with 30+ modules already implemented (appointments, reports, prescriptions, insurance, invoices, family, notifications, profile). Phase 5 wraps and re-designs it under the specified `/patient` URL space with a premium shell, unified UX states, mobile bottom-nav, and a hero dashboard — reusing existing server functions and data instead of duplicating them.

## Scope

### 1. Route surface (new files under `src/routes/_authenticated/patient*`)
```text
patient.tsx                → PatientShell (top bar + mobile bottom-nav + <Outlet />)
patient.index.tsx          → Premium dashboard (hero cards)
patient.appointments.tsx   → Tabs: Upcoming | Pending | Previous | Cancelled
patient.reports.tsx        → Tabs: Lab | Radiology | Visits | Certificates | Referrals
patient.prescriptions.tsx
patient.insurance.tsx      → Approvals + verifications
patient.billing.tsx        → Invoices + payments + refunds
patient.requests.tsx       → Service inquiries + home care + 2nd opinion
patient.family.tsx         → Dependents + active profile switcher
patient.notifications.tsx
patient.profile.tsx
patient.security.tsx       → Sessions/devices + auth events + 2FA
```
Existing `/portal/*` routes stay for now and add a `redirect` to their `/patient/*` twin after 1 release cycle.

### 2. Shell (`src/components/patient/PatientShell.tsx`)
- Top bar: logo, active-profile switcher (self + verified dependents), locale toggle, notifications bell, avatar menu (Profile / Security / Sign out).
- Desktop: no side nav — page content full width, quick links inside cards.
- Mobile (≤ md): fixed bottom nav with 5 items — الرئيسية / مواعيدي / احجز (FAB) / تقاريري / حسابي, using `useRouterState` for active state.
- Layout guards nested `<main>`, aria-labels, RTL/LTR safe.

### 3. Dashboard hero (`patient.index.tsx`)
Bento grid of cards, each fed by an `ensureQueryData` in the loader. Every card has explicit Loading / Empty / Error via the shared `states/index.tsx`:
- Next appointment (with check-in / directions / calendar)
- Required actions (unverified insurance, unsigned consents, unpaid invoice, unconfirmed OTP)
- New reports (last 30d unread)
- Active prescriptions
- Outstanding invoices
- Insurance approvals status
- Open service requests
- Latest notifications
- Announcements + Offers (public content, cached)
- Suggested services (from `service_catalog`, filtered by history)
- Sticky "احجز موعد" CTA → `/book`

### 4. Unified state components
Extend `src/components/states/index.tsx` with the six required variants and use them in every module:
`<LoadingState/>`, `<EmptyState/>`, `<ErrorState/>`, `<OfflineState/>` (navigator.onLine), `<PermissionDenied/>`, `<SessionExpired/>` (redirects to `/auth/login?next=`).
Wrap every route body with `<FeatureErrorBoundary>` from Phase 1.

### 5. Module details
- **Appointments** — reuse `listMyAppointments`; tab filter by status; row actions: confirm attendance (existing check-in RPC), reschedule (→ `/book?rescheduleId=`), cancel (existing fn), digital check-in (existing QR flow), directions (Google Maps deep-link from branch coords), add-to-calendar (`.ics` blob), download confirmation PDF, request follow-up (creates `service_inquiries` row of type follow_up).
- **Reports** — sub-tabs; each card fetches from `lab_reports` / `radiology_reports` / `medical_reports` / `patient_visits`; secure preview through existing `signed-url.server.ts`; every open/download writes to `sensitive-access.server.ts`; new "Access History" tab reads back the same audit rows scoped to `actor_id = auth.uid()`.
- **Prescriptions** — reuse existing portal query; add refill request + pharmacy dispatch link.
- **Insurance / Billing / Requests / Notifications / Profile / Security** — thin premium re-skin over existing portal server functions; no schema changes.
- **Family** — reuse `dependents`; add-dependent flow requires OTP-verified relationship (existing OTP infra); active-profile switcher stored in `sessionStorage` + server context (`x-active-patient` header validated by a new server helper that checks the caller has an approved dependent link); switching updates all module queries via query-key namespace.

### 6. Security
- `_authenticated` gate already enforces auth; add a `beforeLoad` on `patient.tsx` that calls `resolveHome` to bounce staff/admin roles away.
- All data reads go through existing RLS-scoped server functions (`.middleware([requireSupabaseAuth])`); no direct table reads from the client.
- Family switching: server derives real patient_id from `dependents` table + auth.uid(); the client-provided active-profile hint is only advisory.
- Session-expired detection: global fetch wrapper on server-fn errors → `<SessionExpired/>` overlay.

### 7. Tests
- `tests/e2e/patient_dashboard_hero.py` — dashboard cards render for a seeded patient with mixed data.
- `tests/e2e/patient_family_switch_scope.py` — switching to a dependent scopes appointments/reports and blocks unauthorized dependents.
- `tests/e2e/patient_reports_access_history.py` — opening a report writes an audit row visible in Access History.
- `tests/security/test_patient_isolation.py` — patient A cannot fetch patient B's appointments/reports/invoices via any `/patient/*` server fn (IDOR).

### 8. Non-goals for this phase
- No new backend tables. Everything reuses Phase 2/3/4 infra.
- `/portal/*` routes remain live; deprecation redirects come in Phase 6.
- No native app; the mobile experience is responsive PWA.

## Technical notes
- Routing follows TanStack file convention (`patient.tsx` = layout, dot-separated children).
- Loaders use `ensureQueryData` + `useSuspenseQuery` per project default.
- All new components in `src/components/patient/`.
- All strings run through the existing i18n JSON files with ar/en/ur locales.
