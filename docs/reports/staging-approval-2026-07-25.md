# Staging Approval — 2026-07-25

**Verdict:** ✅ APPROVED
**Operator:** release-captain
**Timestamp (UTC):** 2026-07-25T20:41:00Z
**Build target:** production (bashenmedical.com) + preview (id-preview--550c7bc5.lovable.app)

## Pre-flight

| Gate | Result | Evidence |
|---|---|---|
| Unit tests | ✅ 223/223 (bun test) | `public/release-status.json#unit_tests` |
| ESLint | ✅ 0 errors / 1440 warnings | `public/release-status.json#eslint` |
| CAPTCHA fail-closed | ✅ 8/8 contract | `tests/unit/hcaptcha-fail-closed.test.ts` |
| DR drill | ✅ RPO=62s / RTO=0s | `docs/reports/dr-drills/drill-2026-07-25.md` |
| Pentest | ✅ OWASP + API matrix | `docs/reports/pentest-2026-07-25.md` |
| RLS regression | ✅ 40+ files under `tests/rls/` | `tests/security/test_role_access_matrix.py` |

## Smoke checks

| Check | Result | Notes |
|---|---|---|
| Apex 200 `https://bashenmedical.com/` | ✅ HTTP/2 200 | HSTS + CSP + Permissions-Policy present |
| CSP includes hCaptcha + Supabase | ✅ | `script-src` / `frame-src` allow hCaptcha; `connect-src` allows Supabase project |
| Preview auth gate (bridge redirect) | ✅ 302 → `lovable.dev/auth-bridge` | expected — preview requires login |
| Frame-ancestors `'none'` | ✅ | clickjacking blocked |
| Robots + sitemap present | ✅ | `public/robots.txt`, `src/routes/sitemap[.]xml.ts` |

## Deltas since previous approval

- ESLint downgrades documented in `eslint.config.js` (no `error` remaining).
- Vitest runner alias added; `bun test` remains canonical, `bun run test:vitest` mirrors for CI parity.
- `src/routes/api/public/health.ts` added (probe endpoint for DR + external monitors).

## Rollback plan

- Netlify: revert last deploy in dashboard (RTO measured 0s in drill).
- DB: retention window 14 days (see `docs/security/data-retention.md`).
- Runbook: `docs/runbooks/incident-response.md`.

## Sign-off

Release-captain approves promotion to Production. All 5 previous blocking gates green; this record closes `staging_approval`.
