# Data Retention Policy — Bashen Medical

_Owner: فريق حامد._
_Last updated: 2026-07-24._

## 1. Principles

1. **Minimize** — collect only data required for the stated clinical / operational purpose.
2. **Purpose-bound retention** — every table has a stated purpose and retention window.
3. **Immutability where required** — audit and clinical records are append-only.
4. **Right to erasure** — patient-generated content can be redacted on request; audit metadata is retained per statutory obligation.

## 2. Retention windows

| Category                | Tables (representative)                                                     | Window                            | Notes                                            |
| ----------------------- | --------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------ |
| Clinical records        | `medical_reports`, `lab_reports`, `radiology_reports`, `prescriptions`      | ≥ 10 years                        | Per KSA MoH clinical records regulation.         |
| Appointments            | `appointments`, `appointment_status_history`, `appointment_audit`           | ≥ 10 years                        | Linked to clinical episode.                       |
| Patient identity        | `patients`, `patient_profiles`, `dependents`                                | Life of relationship + 10 years   | Retained even after account close for continuity.|
| Consent                 | `consent_records`                                                           | Life of relationship + 10 years   | Immutable.                                       |
| Audit / security        | `audit_logs`, `security_audit_log`, `booking_trace_events`, `inbox_events`, `cms_audit`, `reservation_manage_events` | ≥ 7 years   | Append-only; no UPDATE/DELETE policy.            |
| Guest booking sessions  | `guest_reservation_sessions`, `slot_holds`                                  | 30 days                           | Purged nightly; PII minimized before purge.      |
| OTP / rate limits       | `otp_challenges`, `auth_rate_limits`                                        | 30 days                           | Purged nightly.                                  |
| AI conversations        | `ai_conversations`, `ai_messages`                                           | 12 months (default), user-erasable | Masked-PII already; user may request purge.     |
| AI safety / telemetry   | `ai_safety_incidents`, `ai_stream_events`, `ai_usage_costs`                 | 24 months                         | For monitoring and calibration.                  |
| Content telemetry       | `content_impressions`, `content_clicks`, `web_vitals`, `perf_budget_alerts` | 6 months                          | Aggregate metrics only.                          |
| CMS content             | `cms_entries`, `cms_versions`, `content_items`, `content_item_versions`     | Indefinite (business record)      | Version history preserved.                       |
| Notification delivery   | `notification_delivery_logs`, `notifications`                               | 12 months                         |                                                  |
| Device sessions         | `device_sessions`                                                           | 90 days after last activity       |                                                  |

## 3. Erasure requests

Patients may request erasure via `/patient/settings/privacy`. Handled by an
admin server fn that:

1. Verifies the requester's identity (fresh OTP).
2. Redacts free-text PII fields (names, notes) with `[redacted:erasure:<ticket-id>]`.
3. Writes an immutable `audit_logs` row recording the redaction.
4. **Does not delete** clinical or audit records (statutory retention).
5. Suspends the account and prevents re-authentication.

## 4. Deletion vs. redaction

- **Delete** — guest sessions, expired holds, expired OTPs, stale telemetry.
- **Redact** — anything covered by statutory retention (clinical + audit).
- **Anonymize** — analytics aggregates may be retained indefinitely.

## 5. Cron sweep

Nightly job `/api/public/cron/retention-sweep` (verified with HMAC; see the
public API cron pattern) performs deletions per §2. Failures alert to the
Ops Inbox as SEV-3.

## 6. Backup interaction

Backups follow the retention window of the source table. PITR retains 7 days of
snapshots; a redacted row may still appear in PITR within that window. On an
erasure request the response letter explicitly notes this to the requester.
