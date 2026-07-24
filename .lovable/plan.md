# Baeshen Platform — Roadmap V3

Source spec: `user-uploads://file-28` (فريق حامد, 1129 lines).
Audit basis: `docs/audit/phase0-refresh-2026-07-24.md`.
Manifest template: `docs/audit/change-manifest-template.md`.

Delivery contract: **one Batch per approval round**, with tests +
rollback plan + Change Manifest for anything touching Auth, RLS,
Payments, NPHIES, or production env.

---

## Track A — Operations close-out

| Batch | Title | Spec § | Risk | Status |
|---|---|---|---|---|
| A1 | Front Desk Polish (MRN search, Patient Snapshot, reschedule, no-show) | §13 | Low | **next** |
| A2 | Doctor Console `/doctor` (today, queue, visit close, follow-up hold) | §15 | Medium | pending |
| A3 | Unified Requests Hub (site+WA+booking+phone in one queue with audit) | §17 | Medium | pending |

## Track B — Patient clinical + financial

| Batch | Title | Spec § | Risk | Status |
|---|---|---|---|---|
| B1 | Reports & Prescriptions lifecycle (Draft→Publish→Revoke, signed URLs, versions) | §18 | Medium | pending |
| B2 | NPHIES 11-state machine + Mock/Prod separation | §19 | High 🔒 | pending manifest |
| B3 | Billing & Payments (Estimate/Invoice/Refund + signed webhook + idempotency) | §20 | High 🔒 | pending manifest |

## Track C — Content & communications

| Batch | Title | Spec § | Risk | Status |
|---|---|---|---|---|
| C1 | Content Engine (Audience, priority, impressions, clicks) | §21 | Low | pending |
| C2 | CMS Cycle (Preview tokens, Rollback UI, scheduled publish) | §22 | Low | pending |
| C3 | Notifications (`delivered` only on provider callback) | §23 | Medium | pending |

## Track D — Production readiness

| Batch | Title | Spec § | Risk | Status |
|---|---|---|---|---|
| D1 | SEO structured data (Doctor / MedicalOrg / Breadcrumb / Article + 404 map) | §27 | Low | pending |
| D2 | A11y WCAG 2.2 AA sweep (keyboard, focus, 200% zoom, reduced motion) | §26 | Low | pending |
| D3 | System Health (Payments/NPHIES/AI/Backup probes) | §28 | Low | pending |
| D4 | AI Safety hardening (prompt-injection tests, mutation gate) | §24 | Medium | pending |

---

## Rules (from master file)

- No parallel tables, no static production data, no fake CTAs, no fake
  success (§5, §31).
- Every Batch delivers: owner, affected files, tests, rollback,
  acceptance, Change Manifest (§4).
- Sensitive Batches (Auth, RLS, Payments, NPHIES) block on المهندس
  حامد's explicit approval before merge.
- `tsgo`, ESLint, unit + RLS + E2E must be green before delivery.

## Definition of Done per Batch

1. End-to-end wired to real data.
2. RBAC + RLS enforced server-side.
3. AR + EN, mobile + desktop.
4. Loading / empty / error / offline states.
5. Audit rows for sensitive edits.
6. No fake success, no fake CTAs.
7. Tests green, docs updated, rollback documented.

---

## Next action

Awaiting المهندس حامد's pick of the first Batch to execute. Default
recommendation: **A1 — Front Desk Polish**.
