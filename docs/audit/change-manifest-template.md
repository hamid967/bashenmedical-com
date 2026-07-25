# Change Manifest — Template

Required by master file §4 before any sensitive change (Auth, RLS,
patient data, payments, NPHIES, production env, new medical/gov
integration). Fill one file per Batch under `docs/audit/manifests/`.

---

## Batch: `<code + short title>`

- **Owner**: `<name>`
- **Approver**: المهندس حامد
- **Date**: `YYYY-MM-DD`
- **Risk**: Low / Medium / High / Critical

### 1. Current state

Describe today's behavior in one paragraph. Link to files/routes.

### 2. Problem

Exactly what is wrong or missing.

### 3. Proposed change

Bullet list. What ships, what does not.

### 4. Files & tables affected

- Files: `path/one.tsx`, `path/two.functions.ts`
- Tables: `public.<name>` — columns / policies touched
- Server fns / RPC: `<name>`

### 5. Data & user impact

Who is affected. Any migration of existing rows. Downtime window.

### 6. Risks

Concrete failure modes + likelihood.

### 7. Backup

Snapshot / export step taken before applying.

### 8. Rollback plan

Exact SQL / git revert steps to restore prior state.

### 9. Tests

- Unit: `tests/unit/<file>`
- RLS: `tests/rls/<file>`
- E2E: `tests/e2e/<file>`
- Manual QA checklist.

### 10. Duration

Estimated hours + calendar window.

### 11. Acceptance

Bullet list of measurable pass criteria, matching §31 rules
(end-to-end, real data, RBAC, AR+EN, mobile+desktop, full states,
audit, no fake success).

### 12. Approval

- [ ] المهندس حامد approved on `YYYY-MM-DD`.
- [ ] Deployed to preview on `YYYY-MM-DD`.
- [ ] Promoted to production on `YYYY-MM-DD`.
