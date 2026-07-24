# Security Test Matrix — `tests/security/`

_Owner: فريق حامد._
_Last updated: 2026-07-24 (Phase 12)._

Single source of truth mapping the **OWASP-style attack classes** to the tests
that exercise them. When adding a new attack test, register it here.

| Attack class            | Test file(s)                                                       | Kind      | Notes                                                                                        |
| ----------------------- | ------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------- |
| Broken access control   | `test_authz_boundaries.py`, `test_role_access_matrix.py`           | Integ.    | Asserts every admin server fn rejects non-admin roles with 401/403.                          |
| IDOR — cross-patient    | `test_cross_patient_idor.py`                                       | Integ.    | Two patients created; each queries the other's `appointments`, `medical_reports`, `dependents`; RLS must return 0 rows. |
| Authentication bypass   | `tests/e2e/admin_redirect_when_not_admin.py`, `admin_opens_for_admin_user.py` | E2E | Managed `_authenticated` gate + `beforeLoad` role check.                                     |
| Privilege escalation    | `test_secdef_privileges.py`, `test_execute_privileges_regression.py` | DB      | Confirms `PUBLIC` cannot EXECUTE role-scoped SECDEF fns; `has_role` is the only path.        |
| SQL injection           | (code audit — no dynamic SQL in app; supabase-js parameterized)     | Audit     | Add a fuzz test if any raw SQL is introduced.                                                |
| XSS                     | `tests/unit/cms-sanitize.test.ts`                                   | Unit      | DOMPurify config asserts `<script>`, event handlers, and `javascript:` URLs are stripped.    |
| CSRF                    | `test_authz_boundaries.py` (missing-bearer case)                    | Integ.    | Server fns without a valid bearer return 401; public POSTs verify Origin when session-bound. |
| SSRF                    | (code audit — no user-supplied URL fetches)                         | Audit     | Enforced by grep in CI (`rg 'fetch\(.*req\.body' src/`).                                     |
| File upload             | `tests/unit/signed-url.test.ts` (MIME/size)                         | Unit      | Signed-URL server refuses disallowed MIME or > cap.                                          |
| Open redirect           | `tests/e2e/auth_next_param_same_origin.py`                          | E2E       | Auth `next` param must be same-origin relative path.                                         |
| Session fixation        | Manual — sign-out drops refresh token + REPLACE navigation.         | Manual    | Documented in `tanstack-auth-guards`.                                                        |
| Race conditions         | `tests/e2e/booking_concurrent_hold_409.py`                          | E2E       | Two concurrent `/hold` on same slot → one 200, one 409 with same Idempotency-Key.            |
| Prompt injection        | `test_prompt_injection.md`                                          | Manual    | Curated adversarial prompt matrix; auto-fuzz recommended for pentest.                        |
| Unauthorized export     | `test_authz_boundaries.py` (export subset)                          | Integ.    | Non-admin gets `assertHasRole` rejection; admin export writes `audit_logs`.                  |
| Rate limiting           | `tests/e2e/booking_rate_limit.py`                                   | E2E       | 429 after N `/hold` bursts.                                                                  |

## Running

```bash
# Python integration/E2E
python3 -m pytest tests/security tests/e2e -q

# TS unit tests
bunx vitest run tests/unit
```

## Adding a new test

1. Create the file under `tests/security/` (integration) or `tests/e2e/` (browser).
2. Add a row to this matrix.
3. If the test reproduces an incident, link the incident ID in the docstring.
4. If it exercises a new attack class, add it to
   `docs/security/threat-model-phase12.md` §4.
