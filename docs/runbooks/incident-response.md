# Incident Response Runbook — Bashen Medical

_Owner: فريق حامد._
_Last updated: 2026-07-24._

## 0. Scope

Any event that may compromise **PHI confidentiality, integrity, or availability**,
including but not limited to: credential leak, unauthorized data access, ransomware,
prolonged outage, or suspicious admin activity flagged by `security_audit_log`.

## 1. Severity ladder

| Severity | Definition                                                                 | Response SLA         |
| -------- | -------------------------------------------------------------------------- | -------------------- |
| SEV-1    | Confirmed PHI leak, active intrusion, or platform-wide outage              | 15 min ack, 1 h page |
| SEV-2    | Suspected leak, single-tenant breach, admin priv-esc alert                 | 30 min ack, 4 h page |
| SEV-3    | Degradation, isolated abuse (rate-limit spikes, SLA breach storm)          | 2 h ack, next day    |
| SEV-4    | Cosmetic or informational — audit log anomaly, non-actionable scanner warn | Next business day    |

## 2. Roles

- **IC (Incident Commander)** — on-call engineer; owns timeline & comms.
- **Scribe** — captures decisions in `#inc-<date>` channel; produces post-mortem.
- **Comms** — customer/legal liaison; drafts external notice if SEV-1/2.
- **SME rotation** — Backend, AI, Ops-Inbox, CMS.

## 3. First 30 minutes

1. **Acknowledge** in the on-call channel; declare severity.
2. **Freeze suspect surface**: toggle `ai_feature_flags` off, disable public booking via `rate-limit.server.ts::HARD_STOP`, or revoke a compromised role via `admin.access-hub`.
3. **Preserve evidence**: snapshot `audit_logs`, `security_audit_log`, `inbox_events`, `booking_trace_events` for the affected time window into a private storage bucket (`incidents/<id>/`).
4. **Rotate credentials** if leak suspected:
   - Supabase JWT signing keys → `supabase--migrate_signing_keys` + force re-auth.
   - Any leaked secret → `secrets--update_secret`.
   - Owner MFA reset if `super_admin` compromise suspected.
5. **Contain**: for account takeover, delete the user's active sessions via Auth Admin API and set `patient_profiles.status='locked'` or `user_roles` removed.

## 4. Investigation checklist

- [ ] Timeline of first anomalous event (query `security_audit_log` + `auth_events`).
- [ ] Blast radius: which patient / staff IDs, which tables.
- [ ] Vector: authenticated abuse, misconfigured policy, dependency CVE, or credential leak.
- [ ] Reproducer captured (network trace, curl, or Playwright script under `tests/security/repros/`).
- [ ] Fix identified and staged in a feature branch.

## 5. Communications

- **Internal**: status update every 30 min in `#inc-<date>`.
- **Affected patients** (SEV-1 with confirmed PHI leak): drafted by Comms + legal within 24 h; delivered via WhatsApp + email using the existing notification channels.
- **Regulator**: if required by KSA MoH / NPHIES policy, notify within statutory window.
- **Public status page**: only after Comms + IC agree wording.

## 6. Recovery

1. Deploy fix through the normal migration + PR flow. **No hotfix bypasses code review.**
2. Re-enable the frozen surface only after confirming the vector is closed (test in `tests/security/repros/` fails-to-exploit).
3. Rotate any credential that may have been observed during containment.

## 7. Post-mortem (72 h)

Blameless template at `docs/reports/post-mortems/<inc-id>.md`:

- Timeline (UTC).
- Contributing factors (5 whys).
- Detection gap analysis.
- Preventive actions with owners + due dates.
- Regression test added under `tests/security/`.

Every SEV-1 or SEV-2 must add a regression test **before** the incident is closed.

## 8. Contacts

| Role                | Channel                                    |
| ------------------- | ------------------------------------------ |
| On-call engineer    | PagerDuty rotation `bashen-primary`        |
| Legal / DPO         | Internal — see org phonebook               |
| Supabase support    | Support ticket + Slack shared channel      |
| Cloudflare support  | Enterprise portal                          |
| KSA MoH / NPHIES    | Compliance lead                            |
