# Change Manifest v1 — APPROVED
_Date: 2026-07-20 · Approver: Owner_

## Frozen (no changes without a new manifest revision)
- `auth.*`, `storage.*` schemas.
- Payments code paths.
- Medical-document tables (`medical_reports`, `lab_reports`, `radiology_reports`, `prescriptions`, `report_versions`, `patient_attachments`).
- All DB migrations that alter or drop existing objects.

## Allowed under v1 (additive / low-risk only)
- Additive design tokens in `src/styles.css`.
- New files under `src/lib/observability/*`, `src/components/marketing/*`, `docs/audit/*`, `tests/a11y/*`.
- SEO metadata edits per-route.
- Playwright and Vitest coverage expansion.
- Public-route content and copy.
- Non-destructive additive migrations (new tables with full GRANT+RLS+policies, new columns with defaults) — must still be reviewed migration-by-migration.

## First-wave shipped under v1 (this turn)
1. `src/lib/observability/web-vitals.ts` — zero-dep LCP/CLS/INP/FCP/TTFB sampler; posts to `/api/public/hooks/web-vitals` (endpoint TBD, fails silently).
2. `src/routes/__root.tsx` — client-only `useEffect` bootstraps the sampler after hydration; SSR untouched.
3. `tests/a11y/axe_baseline.py` — Playwright + axe-core baseline over 12 routes × AR/EN, writes JSON + Markdown to `docs/audit/`.
4. `.lighthouserc.json` — Lighthouse CI budgets (LCP ≤ 2.5s, CLS ≤ 0.1, TBT ≤ 200ms; a11y ≥ 0.9 as error, perf ≥ 0.85 as warn).
5. `docs/audit/2026-07-day-01_audit-report.md` — Day 1 audit.

## Next slices awaiting go-signal (still low-risk, additive)
- Web-vitals collector route `/api/public/hooks/web-vitals` + `web_vitals` table migration (adds ONE new table with full RLS — additive).
- Run `python3 tests/a11y/axe_baseline.py` against the running preview and publish the report.
- Wire `.lighthouserc.json` into CI as a non-blocking job.
- Booking mobile UX pass (frontend only, no schema).

Reply with which slice to execute next.
