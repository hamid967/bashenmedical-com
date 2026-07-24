# Phase 7 — Enterprise Medical Admin Command Center

Rebuild `/admin` as the central control system with a unified shell, 26 modules, and a real-data KPI dashboard. Ship in 6 batches so each is reviewable and testable.

The current codebase already ships `AdminShellV2`, `CommandPaletteV3`, doctors CRUD, unified inbox, audit logs, content, visual analytics, web vitals, realtime monitor, role-permissions matrix, and AI dashboards. Phase 7 consolidates them under one shell, fills gaps, and standardizes states.

## Batch 1 — Shell + Chrome (foundation)
- Extend `AdminShellV2`:
  - Collapsible sidebar with grouped modules (Operations / Clinical / Content / Governance / System) and persisted collapse state.
  - Sticky top command bar: global search input (opens palette), branch switcher, language switcher, notification center trigger, AI assistant trigger, user menu.
  - Mobile responsive drawer nav (`Sheet`) with the same tree.
  - Breadcrumbs derived from the active TanStack route.
  - Keep light theme only (per project memory: dark mode removed). Provide a density toggle (comfortable/compact) instead of theme switcher.
- Unify `CommandPaletteV3` shortcuts (⌘/Ctrl+K) and route-jump entries for all 26 modules + quick actions (New appointment, New patient, New article, Broadcast content).
- Notification center: pull from existing `notifications` table (already wired for admins).
- AI Assistant Panel: side sheet reusing existing admin AI chat route.

## Batch 2 — Real-data Overview KPIs
Replace the current mixed real/mock KPI grid with 14 real-data KPIs. Add one server function `getCommandCenterKpisV2` returning all metrics in a single call with previous-period comparison:

| KPI | Source |
|---|---|
| Today's appointments | `appointments` where date=today |
| Confirmed appointments | status=confirmed today |
| Pending requests | `service_inquiries` status=pending + `appointments` status=pending |
| Cancellations | `appointments` status=cancelled today |
| No-show rate | `appointments` no_show / total (7d) |
| Clinic occupancy | booked slots / available slots today |
| Available slots | `availability_slots` remaining today |
| New patients | `patients` created today |
| Pending reports | `medical_reports`/`lab_reports`/`radiology_reports` status=pending |
| Insurance approvals | `insurance_approvals` status=pending |
| Unpaid invoices | `invoices` status=unpaid |
| WhatsApp requests | `service_inquiries` source=whatsapp today |
| Support requests | `complaints` open |
| Integration failures | `integration_logs` status=error (24h) |

Each KPI card: Loading skeleton, Error retry, Empty ("no data yet"), and a drill-down `Link` to its module route with matching filters. Uses `FeatureErrorBoundary` and `states/index` primitives.

## Batch 3 — Module route audit + fill gaps
Ensure a route exists under `/admin/*` for every listed module. Existing → reuse. Missing → create thin index shells (list + filters + accessible enterprise table with sort/paginate) wired to existing server fns:

- Existing: Overview, Inbox (Unified Requests), Appointments, Patients, Doctors, Content, Content Analytics, Audit Logs, Role-Permissions Matrix, Web Vitals, Realtime Monitor, AI Streaming, Visual Analytics.
- Create thin shells: Schedules, Reports, Billing, Insurance, WhatsApp Requests (filter of Inbox), Support (Complaints), Offers (filter of Content), Announcements (filter of Content), Services, Specialties, Branches, Articles (Health articles), Files (Media Library), Analytics (index linking sub-dashboards), Users, Roles, Integrations, AI Settings, System Settings, System Health.

Each thin shell uses one shared `EnterpriseTable` component (Batch 4).

## Batch 4 — Accessible Enterprise Table primitive
New `src/components/admin/v3/EnterpriseTable.tsx`:
- Semantic `<table>` with `role`, `aria-sort`, sticky header, keyboard row focus.
- Column defs, server-driven sort/pagination/filter props.
- Built-in Loading / Error / Empty / PermissionDenied states via `states/index`.
- Row actions dropdown, bulk selection, RTL-aware.
Adopt in Doctors and Appointments first; roll into other modules over time.

## Batch 5 — Instant client navigation + polish
- Add `preload="intent"` on all sidebar `Link`s.
- Register hover-preload for palette results.
- Confirm every `/admin/*` route has `errorComponent` + `notFoundComponent` (spot-fix any missing).
- Set `head()` per route: unique title, `noindex`.

## Batch 6 — Tests
- `tests/e2e/admin_shell_navigation.py`: sidebar collapse persistence, palette open with ⌘K, branch switch, breadcrumb accuracy, mobile drawer.
- `tests/e2e/admin_kpis_real_data.py`: seed known rows, assert each KPI value + drill-down link target.
- `tests/react/enterprise-table.test.tsx`: sort, empty, error, keyboard nav.
- CI: add to existing e2e workflow.

## Out of scope (explicit)
- Dark mode (removed per project memory; ship density toggle instead).
- Rewriting existing working modules (Doctors, Inbox, Content, Audit) — only re-skin under new shell.
- New backend features beyond the KPI aggregator.

## Deliverables per batch
Each batch ends with: files changed, screenshots of key screens, `bun run build:dev` + typecheck clean, and any migration listed separately for approval.

## Approval question
Confirm the batch order and that shipping without dark mode (density toggle instead) is acceptable, or tell me to re-add a light/dark toggle. I'll start Batch 1 on approval.
