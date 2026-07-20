# Baeshen Medical Center — Day 1 Audit Report
_Owner: Executive/Product Director · Date: 2026-07-20 · Status: Draft for Change Manifest review_

## 0. Executive summary
The platform is significantly more mature than a greenfield engagement: bilingual RTL/LTR is live, ~85 tables with RLS, booking with atomic slot holds and waitlist auto-offer, admin gate with server-side role check, GSC-verified SEO, PWA icons + manifest already shipped. The remaining work is **quality, depth, and finish** — not foundations. This report freezes the current state so the Change Manifest can gate the next wave.

## 1. Route inventory (snapshot)
- **Public marketing (25 routes):** `/`, `/about`, `/branches`, `/branches/:slug`, `/doctors`, `/doctors/:slug`, `/excellence`, `/excellence/:slug`, `/health`, `/health/:slug`, `/health/search`, `/accreditations`, `/faq`, `/contact`, `/careers`, `/corporate`, `/complaints`, `/emergency`, `/complex`, `/book`, `/booking-confirmation`, `/app`, `/auth`, plus API/well-known.
- **Patient portal (28 routes)** under `_authenticated/portal.*`: dashboard, appointments, book, calendar, family, notifications, prescriptions, reports, laboratory, radiology, records, insurance, invoices, payments, refunds, orders, complaints, consents, doctors, inquiries, profile, settings, reminder-preferences, sessions, schedule.
- **Admin/Super-admin (50+ routes)** under `_authenticated/admin.*` plus siblings: dashboard, calendar, appointments-queue, patients management, doctors management, HR, pharmacy, inventory, orders-unified, clinic-settings, message-templates, notifications-queue, ratings, complaints-admin, corporate-admin, second-opinion-admin, patient-stories-admin, RBAC, audit-log, audit-export, transition-alerts, super/monitoring, super/permissions, mcp-status, intro-settings, qr-cards.

**Finding:** surface area is very broad; many admin routes exist but coverage depth and consistency need a per-route QA pass. Priority for the audit is **completeness scoring** per route, not new routes.

## 2. Category scorecards (0–5)

| Area | Score | Notes |
|---|---|---|
| Foundations (stack, TS strict, routing) | 5 | TanStack Start, strict TS, file-based routes clean. |
| Booking core | 4 | Atomic holds, waitlist auto-offer, self check-in with window+idempotency, WhatsApp on check-in. Missing: insurance-aware selection, reason taxonomy, queue ETA on screen. |
| Patient portal breadth | 3 | Routes exist for reports/Rx/insurance/invoices; UX depth and empty/error states inconsistent. |
| Admin depth | 2 | 50+ routes; many partial. Needs prioritized deep-dive per surface. |
| Security / RLS | 4 | Role-gated policies, `search_path` pinned, `anon` execute revoked on internal helpers, `system_settings` staff-only. Residual: periodic re-review + signed-URL access log. |
| SEO | 4 | Per-route metadata, unified `og:url`, GSC verified. Residual: JSON-LD Organization/Hospital, sitemap coverage audit. |
| Accessibility | 2 | No formal audit run recently. Semantic components in place, but no automated axe report. |
| Performance | 2 | No perf budgets enforced; no Lighthouse CI. |
| PWA | 3 | Manifest + icons + offline.html + `sw-push.js` present. Not installable-tested; no NetworkFirst app-shell wrapper. |
| Content quality | 2 | Copy needs medical-writer review AR + EN across top 20 pages. |
| Brand / motion | 2 | Palette moved to teal/gold, but no Jazan-inspired pattern system or motion primitives. No cinematic intro. |
| Observability | 1 | No error monitoring, no web-vitals collection, no cron heartbeats. |

## 3. Top risks (ranked)
1. **No error monitoring** — regressions go silent until a user complains.
2. **A11y unknown** — WCAG 2.2 AA claim cannot be evidenced today.
3. **Perf unmeasured** — no LCP/CLS/TBT trend; mobile Arabic pages at risk.
4. **Admin depth debt** — half-implemented admin surfaces confuse staff and hide bugs.
5. **Signed-URL access log missing** — medical documents accessed without audit trail.
6. **Twilio/WhatsApp cost exposure** — no per-recipient/day cap once live secrets land.
7. **Vendor lock** — no documented export/restore playbook for Cloud/Supabase.

## 4. Change Manifest v1 — proposed frozen/allowed
**Frozen until approval:** `auth.*`, `storage.*`, payments logic, medical-document tables, ALL migrations.
**Allowed to proceed in parallel:**
- Audit deliverables (a11y, perf, SEO, security, content).
- Observability wiring in `src/routes/__root.tsx` (client-only).
- Design tokens (additive only) in `src/styles.css`.
- Marketing copy + imagery + JSON-LD.
- Playwright coverage expansion.
- Docs and this audit folder.

## 5. First-wave backlog (post-approval)
- **P0-1** Observability: web-vitals + client error boundary + cron heartbeat table.
- **P0-2** A11y automated pass (axe) on top 20 routes; publish report.
- **P0-3** Lighthouse CI with budgets (LCP ≤ 2.5s, CLS ≤ 0.1, TBT ≤ 200ms).
- **P0-4** Booking mobile UX pass (inline errors, queue ETA, insurance selector).
- **P1-1** Portal: reports viewer with signed URLs + access log (needs migration → gated).
- **P1-2** Jazan design token additions (patterns, motion primitives) — additive only.
- **P1-3** Cinematic intro (skip-first, reduced-motion, lazy, no autoplay audio).
- **P2-1** Admin appointments ops board consolidation.
- **P2-2** Waitlist ops board.

## 6. Testing & rollback baseline
- Vitest unit + integration for hooks, validators, RPC wrappers.
- Playwright: booking (guest/logged-in/family), portal, admin gate, waitlist offer, check-in window, AR + EN, 3 viewports.
- Every migration paired with reverse migration.
- Feature-flag risky UI via `system_settings` flag rows.

## 7. Deliverables next 5 days (no high-risk changes)
1. A11y report (axe run + manual keyboard sweep) — Owner: QA/A11y.
2. Perf baseline (Lighthouse mobile + desktop, AR + EN home/book/portal) — Owner: FE lead.
3. Content inventory + gap list top 20 pages — Owner: Medical writer + BA.
4. Photography shot list + doctor consent sheet — Owner: Creative Director.
5. Change Manifest v1 sign-off — Owner: Exec/Product Director.

---
_Awaiting Change Manifest v1 approval before touching auth, payments, medical data, or migrations._
