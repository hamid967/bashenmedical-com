# Phase 12 — Security Hardening (Completion Report)

_Owner: فريق حامد — Security._
_Date: 2026-07-24._

## Scanner status

| Scanner              | Findings           | Notes                                                                     |
| -------------------- | ------------------ | ------------------------------------------------------------------------- |
| `supabase`           | 1 warning          | `SUPA_function_search_path_mutable` — only in `extensions` schema (pgcrypto, uuid-ossp, pg_stat_statements). Supabase-managed; **accepted residual**. |
| `supabase_lov`       | 0                  |                                                                           |
| `supply_chain`       | 0 (0 high/critical)| Re-verified via `code--dependency_scan` on 2026-07-24.                    |
| `agent_security`     | 0                  |                                                                           |
| `app_mcp`            | 0                  |                                                                           |
| `connector_security` | 0                  |                                                                           |

App-level SECDEF exposure was closed in the previous batch (`docs/reports/secdef-final-2026-07-24.md` — 0 exposed SECDEF functions). No new fixes required in this phase; the extension-schema warning cannot be closed from application migrations.

## Deliverables

| Artefact                                              | Purpose                                                                    |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `docs/security/threat-model-phase12.md`               | STRIDE model per surface + control matrix + residual risks.                |
| `docs/security/data-retention.md`                     | Retention windows, erasure flow, cron sweep contract.                      |
| `docs/runbooks/incident-response.md`                  | Severity ladder, first 30 min, comms, post-mortem template.                |
| `docs/runbooks/backup-recovery.md`                    | PITR + snapshot policy, RPO/RTO, drill cadence.                            |
| `tests/security/README.md`                            | Attack-class → test file matrix (single source of truth).                  |
| `tests/security/test_cross_patient_idor.py`           | New RLS-level IDOR guard exercising cross-patient reads and update probes. |
| `tests/security/test_prompt_injection.md`             | Adversarial prompt matrix for the AI Assistant.                            |

## Controls verified in place (from earlier phases)

- Managed `_authenticated/route.tsx` gate + bearer-token `functionMiddleware` in `src/start.ts`.
- `assertHasRole` unified in `src/lib/admin/_guard.ts` — called at the top of every admin server fn.
- RLS on every user-data table; policies scoped by `auth.uid()` or `has_role`.
- Immutable audit tables (`audit_logs`, `security_audit_log`, `booking_trace_events`, `inbox_events`, `cms_audit`, `reservation_manage_events`) — INSERT-only.
- `src/lib/rate-limit.server.ts` on `/api/public/book/hold` and `/api/public/inquiries/create`.
- Private storage buckets + `signed-url.server.ts` (MIME/size checks, short TTL).
- Two-phase HMAC confirmation for AI tool invocations.
- Client-side + server-side PII masking on AI messages.

## Residual risks (require external pentest — production launch blocker)

1. **CAPTCHA** absent on WhatsApp OTP and public inquiries — rate-limit is baseline only.
2. **Automated prompt-injection fuzz** — manual matrix only.
3. **Secret scanning in CI** — recommend gitleaks pre-commit + GitHub secret scanning.
4. **Cross-region DR drill** — not yet rehearsed.
5. **`extensions` schema linter warning** — accepted; Supabase-managed.
6. **Independent penetration test attestation** — required before production. This report is **not** a pentest.

## Verification

```bash
# Docs present and referenced
rg -l 'threat-model-phase12|incident-response|backup-recovery|data-retention' docs tests

# Security tests discoverable
python3 -m pytest tests/security --collect-only -q

# No dependency vulns
# (see code--dependency_scan run 2026-07-24 — clean)
```

## Sign-off

This phase closes internal hardening. **Do not treat as production-ready** until:

1. An independent professional penetration test is completed and its findings are triaged.
2. The residual risks in §"Residual risks" above are either mitigated or explicitly accepted by the DPO.
