# Phase 0 Refresh — Full Audit (2026-07-24)

Refresh of `docs/audit/phase0-audit-2026-07-23.md` after Batches through
Phase 3 Backend + Front Desk scaffold. Scope: verify what actually ships
against §6–§28 of the master file, and rank gaps.

Owner: Hamed. Status: **snapshot** — no code changed by this document.

---

## 1. Inventory (from repo, not spec)

| Surface               | Count                                                   | Notes                                |
| --------------------- | ------------------------------------------------------- | ------------------------------------ |
| Public routes         | 60 files in `src/routes/*.tsx` (excl. `_authenticated`) | All §6 pages present                 |
| Authenticated routes  | 171 files in `src/routes/_authenticated/`               | 75 under `admin.*`                   |
| Patient portal routes | 12 (`patient.*`)                                        | Covers all §14 targets               |
| Owner routes          | 7 (`owner.*`)                                           | Site Builder + accounts              |
| Admin server fns      | 44 modules in `src/lib/admin/*.functions.ts`            | Guarded via `assertHasRole`          |
| Public API routes     | `src/routes/api/public/*`                               | rate-limited (book/hold, inquiries)  |
| Tables                | 128 (see `<supabase-tables>`)                           | RLS enabled on every user-data table |

Deployment: TanStack Start v1 on Cloudflare Workers via Lovable Cloud.
Auth: Supabase (managed `_authenticated` gate). RBAC: `user_roles` +
`has_role` SECURITY DEFINER RPC. AI: Lovable AI Gateway with PII masking.

---

## 2. Coverage vs. Master File §6–§28

Legend: ✅ shipped, 🟡 partial, ❌ gap, 🔒 pending Hamed approval.

| §   | Area               | Status | Evidence / gap                                                                                                                                                                                                                                           |
| --- | ------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §6  | Public site        | ✅     | All 16 home sections + services/specialties/doctors/branches/offers/insurance/articles/FAQ/search/contact/policies/complaints ship.                                                                                                                      |
| §7  | Design System      | ✅     | ui-v3 layer, `design.portal-primitives.tsx`, `design.storybook.tsx`, Jazan tokens, RTL/LTR, no neon.                                                                                                                                                     |
| §8  | Photography plan   | 🟡     | Assets pipeline via lovable-assets exists; medical imagery still placeholder for some specialties.                                                                                                                                                       |
| §9  | Intro              | ✅     | `intro-settings.tsx` with Skip + reduced-motion + admin toggle.                                                                                                                                                                                          |
| §10 | Auth               | ✅     | login/register/verify/recovery/update-mobile/session-expired + OTP+WhatsApp+hCaptcha.                                                                                                                                                                    |
| §11 | RBAC               | 🟡     | Roles: admin, super_admin, reception, branch_manager, content_manager, editor, doctor, nurse, hr, pharmacy, support_agent, auditor. **Missing**: Reports Officer, Billing Officer, Insurance Officer as first-class roles (currently folded into admin). |
| §12 | Booking SPA        | ✅     | `/book`, slot holds, idempotency, atomic RPC, QR, reference `BMC-APT-YYYYMMDD-####`.                                                                                                                                                                     |
| §13 | Front Desk         | 🟡     | `/admin/front-desk` shipped w/ today+queue; **missing** MRN search, Patient Snapshot card, reschedule dialog, no-show workflow → Batch A1.                                                                                                               |
| §14 | Patient portal     | ✅     | 12/12 routes present incl. billing/insurance/prescriptions/family/security.                                                                                                                                                                              |
| §15 | Doctor console     | ❌     | **No `/doctor` route.** Server fns for schedules exist but no doctor-scoped UI → Batch A2.                                                                                                                                                               |
| §16 | Admin center       | ✅     | 75 admin routes + Command Palette + Global Search + branch switcher.                                                                                                                                                                                     |
| §17 | Requests hub       | 🟡     | Fragmented across `admin.inbox`, `admin.service-inquiries`, `orders-unified` → Batch A3 to unify per §17 columns/actions.                                                                                                                                |
| §18 | Reports & Rx       | 🟡     | Tables + basic upload exist; **missing** Draft→Review→Approve→Publish→Revoke workflow + Version History → Batch B1.                                                                                                                                      |
| §19 | NPHIES             | 🟡     | Adapter + logs exist; **missing** full 11-state machine surfaced in UI + Mock/Prod gate → Batch B2.                                                                                                                                                      |
| §20 | Billing & Payments | 🟡     | Invoices + refunds tables; **missing** signed-webhook confirmation + Estimate flow → Batch B3.                                                                                                                                                           |
| §21 | Content engine     | 🟡     | Announcements/offers exist; impressions/clicks tracked; **missing** Audience segmentation + priority queue → Batch C1.                                                                                                                                   |
| §22 | CMS cycle          | 🟡     | Draft/Review/Approved/Scheduled/Published present in `cms_entries`; **missing** Rollback UI + Preview tokens usage → Batch C2.                                                                                                                           |
| §23 | Notifications      | 🟡     | `notification_delivery_logs` tracks statuses; **missing** enforced `delivered` only after provider callback → Batch C3.                                                                                                                                  |
| §24 | AI assistant       | ✅     | Streaming, PII masking, cost meter, tool invocations audited. Mutations behind explicit flag.                                                                                                                                                            |
| §25 | Security           | ✅     | RLS + `assertHasRole` + hCaptcha + rate limits + audit log + retention doc + IR runbook. Pentest = external gate.                                                                                                                                        |
| §26 | Perf & A11y        | 🟡     | Web Vitals dashboard live; **no repo-wide WCAG 2.2 AA sweep since v2 audit** → Batch D2.                                                                                                                                                                 |
| §27 | SEO                | 🟡     | Sitemap, robots, canonical, OG present; **missing** doctor/medical-org/breadcrumb/article JSON-LD everywhere → Batch D1.                                                                                                                                 |
| §28 | System Health      | 🟡     | `admin.services-health.tsx` + `admin.observability.tsx` exist; **missing** payments/NPHIES probe rows + backup marker → Batch D3.                                                                                                                        |

---

## 3. Critical / High findings (Prioritized Backlog)

| #   | Sev  | Finding                                                                                               | Batch            |
| --- | ---- | ----------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | High | `/doctor` UI absent — §15 unmet.                                                                      | A2               |
| 2   | High | Requests hub fragmentation → operators juggle 3 pages.                                                | A3               |
| 3   | High | Reports lifecycle (Publish/Revoke/Version) not in UI.                                                 | B1               |
| 4   | High | NPHIES UI does not distinguish Mock from Production.                                                  | B2               |
| 5   | Med  | Payment `delivered=paid` set before webhook verify in one path (`billing.functions.ts` needs review). | B3               |
| 6   | Med  | Front Desk missing MRN search + Snapshot.                                                             | A1               |
| 7   | Med  | Notifications may mark `delivered` locally without provider callback.                                 | C3               |
| 8   | Med  | No Reports/Billing/Insurance Officer roles distinct from admin.                                       | after A/B tracks |
| 9   | Low  | Doctor/Medical-Org JSON-LD missing on `/doctors/$slug` and `/branches/$slug`.                         | D1               |
| 10  | Low  | Some specialty pages still use placeholder imagery.                                                   | §8 follow-up     |

None of the findings are `Critical` in the master-file sense (data
exposure, auth bypass, payment loss); the last security scan closed
those. All open items are functional gaps against §6–§28.

---

## 4. Build / Test snapshot

- `bunx tsgo --noEmit` — clean at HEAD.
- 55/55 unit tests passing (last verified Phase 13).
- Playwright E2E: booking + admin redirect suites green.
- RLS tests: 25+ files under `tests/rls/` all green.
- Security matrix: `test_role_access_matrix.py` green.

---

## 5. Recommended sequence

Execute in this order (one Batch per approval round):

`A1 → A2 → A3 → B1 → B2 → B3 → C1 → C2 → C3 → D1 → D2 → D3 → D4`

`A1` is the safest first move: pure UI + one server-fn extension, no
RLS/auth/payment changes, extends already-approved Front Desk scaffold.

---

## 6. Change Manifest requirement

§4 of master file requires a Change Manifest before every sensitive
change. Template lives at `docs/audit/change-manifest-template.md` and
must be filled per Batch touching Auth, RLS, Payments, NPHIES, or
production env.
