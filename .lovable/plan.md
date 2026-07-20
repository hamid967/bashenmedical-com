# Baeshen Medical Center — Elite Studio Engagement

## 1) Current Project Assessment (audit snapshot)

**Stack in place:** React 19 + TypeScript + TanStack Start/Router + Tailwind v4 + shadcn/ui + Supabase (Lovable Cloud) + TanStack Query + RHF + Zod + Playwright. Bilingual AR/EN with RTL support already wired. ~85 DB tables with RLS.

**What works today**
- Public marketing site (home, specialties, doctors, branches, centers, FAQ, contact) — SSR routes with per-route SEO metadata; `og:url` unified to bashenmedical.com; GSC verified.
- Booking flow: multi-step wizard, slot holds with atomic guards, family/guest bookings with OTP linking, digital self-check-in with time window + idempotency, WhatsApp on check-in, appointment timeline.
- Waitlist auto-offer on cancellation (10-min hold) + WhatsApp offer via cron.
- Patient portal shell: appointments, dependents, notifications.
- Admin portal: service inquiries with `has_role` guard + server-side `beforeLoad` gate; `_authenticated` layout gates all protected routes; non-staff auth users routed to `/portal`.
- Security posture: role-based RLS on sensitive tables, `search_path` pinned on SECURITY DEFINER fns, `anon` execute revoked on internal helpers, tightened `WITH CHECK` on public request forms, `system_settings` staff-only read.
- Unified contact number `+966 55 508 8623` sitewide; WhatsApp CTA via `whatsappUrl()` helper.
- CI: e2e admin login flow with auto-provisioned `admin-e2e` user.

**Gaps / known issues**
- Patient dashboard still thin: no medical reports viewer, prescriptions, insurance approvals, invoices/payments surfaces wired end-to-end.
- No true PWA (installable + offline shell + push) — only web push subscriptions table exists.
- No cinematic intro; brand system is functional but not premium/Jazan-flavored.
- Admin/Super Admin: many tables exist (payroll, inventory, complaints, ratings, second-opinion, corporate, home-care, nurse-calls, insurance) without full CRUD UX.
- Doctor profile images: initials placeholder only (per memory).
- Some public routes still rely on generated components without curated copy or medical-writer review.
- No formal a11y audit report; no cross-browser matrix executed since the last redesign pass.
- WhatsApp/Twilio requires live secrets to actually deliver — currently `skipped` without them.

**Main problems**
1. UX inconsistency between marketing site and patient/admin apps.
2. Patient value: booking works, but post-visit journey (reports, Rx, insurance, billing) is incomplete.
3. Content quality: copy, imagery, and medical accuracy need editorial pass in AR + EN.
4. Brand ceiling: current design is clean but generic; lacks Jazan visual identity, motion, and premium finish.
5. Admin depth: too many half-covered domains for one release.
6. Observability & QA: no error monitoring, no perf budgets enforced, thin automated a11y.

## 2) Team Structure (single accountable owner per lane)

```text
Executive/Product Director ── Project Manager
    │
    ├─ Squad 1  Public Site + SEO       Lead: Frontend Eng + SEO
    ├─ Squad 2  Booking + Patient Access Lead: Full-stack + Supabase
    ├─ Squad 3  Patient Dashboard        Lead: Frontend + Backend pair
    ├─ Squad 4  Admin / Super Admin      Lead: Full-stack + BA
    ├─ Squad 5  Security + DB + Integr.  Lead: Backend + Security
    └─ Squad 6  Brand / Content / Film   Lead: Creative Director
Cross-cutting: Healthcare BA, Medical Consultant, RTL Specialist, QA/A11y,
DevOps, Patient Support, AI Engineer.
```

Every ticket carries: Owner · Acceptance Criteria · Deadline · Deps · Test Plan · KPI.

## 3) 90-Day Roadmap

**Days 1–15 — Foundation & Audit (no high-risk changes)**
- Full a11y, perf, SEO, security, content, and DB audits → written reports.
- Design system v2 tokens (Jazan palette, type scale, motion primitives) drafted; no code migration yet.
- Observability baseline: error logging, web-vitals, uptime, cron heartbeats.
- Change Manifest v1 published for approval.

**Days 16–45 — Public Site + Booking polish**
- Squad 1: redesigned home, specialties, doctors, branches, centers, journal, contact — curated AR/EN copy, medical-review sign-off, per-route SEO + JSON-LD.
- Squad 2: booking UX overhaul (mobile-first steps, inline errors, ETA/queue visibility, insurance selector, reason-for-visit taxonomy). Preserve current DB contracts.
- Squad 6: photography plan + shot list; brand icon set v1; motion primitives.
- QA: Playwright coverage for booking + top 10 public journeys, AR + EN, 3 viewports, 4 browsers.

**Days 46–75 — Patient Dashboard + PWA**
- Squad 3: reports viewer (signed URLs), prescriptions, insurance approvals, invoices/payments (read-only first), family switcher, notifications center.
- Mobile/PWA: installable manifest, offline shell for portal, web push wired to `push_subscriptions`.
- AI: symptom-triage helper (advisory only, disclaimered) + FAQ semantic search.
- Cinematic intro (8–12s) with skip, reduced-motion, no autoplay audio, lazy-loaded, mobile-optimized.

**Days 76–90 — Admin depth + Hardening**
- Squad 4: prioritized admin surfaces — appointments ops, waitlist board, complaints/ratings, insurance approvals workflow, reports, audit log viewer, super-admin settings.
- Squad 5: pen-test pass, RLS re-review, rate-limits on public endpoints, backup/restore drill, DR runbook.
- Launch readiness: perf budgets green, WCAG 2.2 AA verified, cross-browser matrix green, rollback rehearsed.

## 4) Priority Backlog (top items)

P0 — Change Manifest approval · a11y report · SEO fixes carry-over · error monitoring · booking mobile UX pass.
P1 — Patient reports/Rx/insurance/invoices UI · PWA installability · Jazan design tokens · content pass for top 20 pages.
P2 — Admin appointments ops board · waitlist board · complaints/ratings workflows · audit log viewer.
P3 — Cinematic intro · AI triage assistant · photography shoot · super-admin analytics.
P4 — Payroll/inventory/home-care/nurse-calls admin surfaces (staged).

## 5) Security & Technical Risks

- Medical data exposure via misconfigured RLS on any new table → mandatory RLS + policy review before merge.
- Signed-URL leakage for reports → short TTL, watermarking, access log.
- Booking race conditions on new flows → keep atomic RPCs; property-test slot holds.
- OTP abuse → per-phone + per-IP rate limits, backoff.
- PWA cache poisoning of stale medical UI → NetworkFirst for HTML, versioned assets only.
- Twilio/WhatsApp cost blow-up → per-recipient/day cap + dedupe.
- Vendor lock (Lovable Cloud/Supabase) → documented export + migration playbook.
- Regression risk on payments/auth/medical writes → gated behind Change Manifest sign-off; no direct schema edits without migration review.

## 6) Budget Allocation ($500k / month, indicative)

- Engineering (FE/BE/Mobile/AI/DevOps): $230k
- Design + Creative + Motion + Photography/Film: $110k
- Content (AR/EN medical writing + translation + review): $45k
- QA + A11y + Security + Pen-test: $55k
- Product/PM/BA/Medical consultant: $40k
- Infra, tooling, licenses, Twilio/WhatsApp, storage, CDN: $20k

## 7) Change Manifest (v1 — awaiting approval)

Frozen until approved: `auth.*`, `storage.*`, payments code paths, medical-document tables, any DB migration. Allowed in parallel: content, copy, imagery, non-schema UI, SEO metadata, docs, tests.

Planned first-wave changes (post-approval):
- Design tokens in `src/styles.css` (additive, no removals).
- New route content components under `src/components/marketing/*`.
- Portal shell enhancements under `src/routes/_authenticated/portal.*`.
- PWA manifest + guarded SW wrapper.
- Observability client boot in `src/routes/__root.tsx`.

## 8) Affected Files & DB Objects (first wave, no migrations yet)

- `src/styles.css` (tokens), `src/routes/__root.tsx` (head + observability), `src/routes/index.tsx` (hero + intro slot), marketing components, portal routes under `_authenticated/portal.*`, `public/manifest.webmanifest`, `public/sw.js` wrapper.
- DB: read-only until manifest approved. Later waves: additive columns on `appointments`, `notifications`, new `report_access_log`; no destructive changes.

## 9) Testing & Rollback Plan

- Unit: Vitest for hooks, validators, RPC wrappers.
- Integration: server-fn tests with role guards (existing pattern).
- E2E: Playwright — booking (guest + logged-in + family), portal, admin gate, waitlist offer, check-in window.
- A11y: axe on all top routes AR + EN; manual keyboard + screen-reader pass on booking + portal.
- Perf: Lighthouse CI budgets (LCP ≤ 2.5s mobile, CLS ≤ 0.1, TBT ≤ 200ms).
- Security: `supabase--linter` clean; RLS regression suite; signed-URL tests.
- Rollback: every migration paired with a reverse migration; feature-flag risky UI; keep previous route components until new ones pass QA; one-command SW kill-switch.

---

**Ask:** approve this plan and the Change Manifest so Squad 1 (Public Site + SEO) and Squad 6 (Brand/Content) can start in parallel with the audit deliverables, while high-risk lanes (auth, payments, medical data, migrations) remain frozen pending sign-off.