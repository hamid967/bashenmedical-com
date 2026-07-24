## Phase 7 — Command Center: status and remaining work

The shell, KPIs, and most infrastructure from Phase 7 are already live. This plan closes the module gap against the 26-item catalog you listed.

### Already delivered (no further work)

Shell & UX
- Collapsible sidebar + mobile drawer (RTL swipe, body-scroll lock, ARIA)
- Sticky top command bar with global search, Command Palette (Ctrl/⌘K), Quick Actions, Branch switcher, Language switcher, Theme switcher, Notification center, AI Assistant panel, Breadcrumbs
- Instant client navigation, light/dark modes, accessible `DataTableV2` with sort/paging/preference persistence + reset

KPIs (all 14 wired to real data with loading/error/empty/drill-down)
- Today's appointments, Confirmed, Pending requests, Cancellations, No-show rate, Clinic occupancy, Available slots, New patients, Pending reports, Insurance approvals, Unpaid invoices, WhatsApp requests, Support requests, Integration failures

Modules present
- Overview, Unified Requests (Inbox), Doctors, Services (service-catalog), Content, Analytics (visual-analytics), Billing, Insurance, Support (service-inquiries), Roles (role-permissions-matrix), Audit Logs, AI Settings, System Health (services-health), plus operational tools (booking-trace, no-show, notification-logs, nphies-logs, realtime-monitor, web-vitals, reservations-usage)

### Gaps to build (13 modules)

Each module = a route file + server-fn(s) with `assertHasRole('admin')` + `DataTableV2` list with loading/error/empty + drill-down where applicable + `head()` metadata. No mocks — real Supabase reads scoped by active branch where relevant.

1. `admin.appointments.tsx` — list + filters (branch, doctor, status, date), drill-down `admin.appointments.$id.tsx` with status history and audit
2. `admin.patients.tsx` — search by MRN/phone/name, drill-down `admin.patients.$id.tsx` (profile, allergies, medications, visits)
3. `admin.schedules.tsx` — doctor availability & leaves per branch, edit availability slots
4. `admin.reports.tsx` — medical/lab/radiology reports queue, signed-url preview, status transitions
5. `admin.whatsapp.tsx` — WhatsApp-sourced inquiries + delivery logs from `notification_delivery_logs`
6. `admin.offers.tsx` — CRUD on offers (new table via `content_items` type=offer or dedicated) — will confirm existing table before choosing
7. `admin.announcements.tsx` — CRUD on announcements (same content_items strategy)
8. `admin.specialties.tsx` — CRUD on `specialties`
9. `admin.branches.tsx` — CRUD on `branches` with excellence centers
10. `admin.articles.tsx` — CRUD on `health_articles` + categories
11. `admin.files.tsx` — Media Library browser over `media_library` with signed previews
12. `admin.users.tsx` — list `profiles` + `user_roles`, invite / role grant (super_admin gated for role changes)
13. `admin.integrations.tsx` — status board over `integration_logs` and `api_permission_errors`
14. `admin.settings.tsx` — `clinic_settings` + `system_settings` editor (super_admin only for system_settings)

### Sidebar wiring

Update `AdminShellV2` navigation groups so the 26 modules resolve in this order:
- Operations: Overview, Unified Requests, Appointments, Schedules, Patients, Doctors, Reports
- Revenue: Billing, Insurance
- Channels: WhatsApp, Support
- Marketing: Offers, Announcements, Articles, Content, Files
- Catalog: Services, Specialties, Branches
- Platform: Analytics, Users, Roles, Audit Logs, Integrations, AI Settings, System Settings, System Health

### Guarantees per module (DoD)

- `head()` with unique title + `robots: noindex`
- Server fns validated with Zod, guarded via `assertHasRole('admin')` (or `super_admin` for Users/Settings writes), audit-logged on writes
- Loading skeletons, error boundary, empty state, drill-down link
- Respects active branch from `useActiveBranch`
- No hardcoded strings for status — pulled from schema/enums
- E2E smoke test for the list route under `tests/e2e/admin_<module>_smoke.py`

### Technical notes

- All new routes live under `src/routes/_authenticated/admin.*.tsx` — the gate is inherited from `_authenticated/route.tsx`; no extra `beforeLoad`.
- Server fns co-located in `src/lib/admin/<module>.functions.ts` using `createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).validator(...).handler(...)`.
- Writes that must bypass RLS load `supabaseAdmin` inside the handler after `assertHasRole` — never at module scope.
- Sidebar entries only render for permissions the caller actually has, via existing `<Can>` component.

### Delivery order (batches)

1. Appointments, Patients, Schedules, Reports (operational core)
2. WhatsApp, Users, Integrations, Settings (platform)
3. Branches, Specialties, Articles, Files (catalog/content)
4. Offers, Announcements (marketing) + sidebar reorg + smoke tests

Approve and I'll ship batch 1 immediately.
