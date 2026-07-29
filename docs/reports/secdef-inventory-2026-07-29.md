# SECURITY DEFINER Inventory — Batch 2 Baseline (2026-07-29)

Snapshot taken before Batch 2 hardening. All functions in `public` schema
with `prosecdef = true`.

## Aggregate

| Metric | Value |
|---|---|
| Total SECDEF functions | 139 |
| `PUBLIC` role leaks | 1 |
| Internal (`_`-prefixed) with anon EXECUTE | 0 |
| Anon-callable, NOT on `PUBLIC_READ_ALLOWLIST` | 10 |
| Authenticated-only (no anon, not internal, not on allowlist) | 50 |

## Batch 2 targets

### Triggers (revoke anon+auth+PUBLIC)
- `generate_appointment_reference()` — trigger on `appointments`
- `sync_dependent_from_verification_request()` — trigger on `dependent_verification_requests`

### Guest RPCs (add to `PUBLIC_READ_ALLOWLIST`, no revoke needed)
- `confirm_appointment_booking(jsonb, text)` — guest booking confirmation
- `verify_appointment_by_reference(text, text)` — guest lookup by ref+phone
- `log_auth_event(text, uuid, text, text, text, jsonb)` — anon must log pre-session failures (see `test_execute_privileges_regression.py`)

### Authenticated-only (revoke anon)
- `get_ai_escalation_status(uuid)`
- `has_permission_in_branch(uuid, text, uuid)`
- `has_role_in_branch(uuid, app_role, uuid)`
- `is_global_role(uuid, app_role)`
- `user_branch_ids(uuid)`

## Full column table

| function | args | anon_x | auth_x | pub_x |
|---|---|---|---|---|
| `_appointment_belongs_to_me` | _phone text | f | t | f |
| `_assert_branch_access` | _branch_id uuid | f | f | f |
| `_assert_slot_free` | _doctor_id uuid, _date date, _time time without time zone, _ | f | f | f |
| `_assert_staff` | () | f | f | f |
| `_emit_appointment_notification` | _appt appointments, _kind text, _title text, _body text | f | f | f |
| `_enforce_owner_cancel_only` | () | f | f | f |
| `_guard_appt_slot_on_update` | () | f | f | f |
| `_guard_profile_verified_phone` | () | f | f | f |
| `_next_booking_reference` | () | f | f | f |
| `_purge_old_permission_errors` | () | f | f | f |
| `admin_list_data_contracts` | () | f | t | f |
| `assign_user_role` | _user_id uuid, _role app_role, _branch_id uuid, _ip text, _u | f | t | f |
| `audit_row_change` | () | f | f | f |
| `auto_transition_content_items` | () | f | f | f |
| `book_appointment_atomic` | p_doctor_id uuid, p_branch_id uuid, p_specialty_id uuid, p_a | t | t | f |
| `book_slot` | p_slot_id uuid, p_patient_name text, p_patient_phone text, p | t | t | f |
| `calculate_no_show_risk` | _appt appointments | f | t | f |
| `can_access_patient` | _patient_id uuid | f | t | f |
| `can_book_for_dependent` | _guardian uuid, _dependent uuid | f | t | f |
| `can_edit_page` | _user_id uuid, _page_id uuid | f | t | f |
| `can_edit_service` | _user_id uuid, _service_id uuid | f | t | f |
| `can_write_patient_clinical` | _patient_id uuid | f | t | f |
| `cancel_appointment_by_ref` | _ref text, _phone text, _reason text | t | t | f |
| `cancel_order_by_ref` | _ref text, _phone text, _kind text, _reason text | t | t | f |
| `claim_service_inquiry` | _request_number text, _link_token uuid | f | t | f |
| `confirm_appointment_booking` | p_data jsonb, p_idempotency_key text | t | t | f |
| `confirm_waitlist_offer` | _ref text, _phone4 text | t | t | f |
| `create_queue_entry_on_appointment` | () | f | f | f |
| `dashboard_appointments_daily` | _branch_id uuid, _days integer | f | t | f |
| `dashboard_by_specialty` | _branch_id uuid, _days integer | f | t | f |
| `dashboard_kpis` | _branch_id uuid | f | t | f |
| `dashboard_peak_hours` | _branch_id uuid, _days integer | f | t | f |
| `dashboard_recent_activity` | _branch_id uuid, _limit integer | f | t | f |
| `dashboard_status_breakdown` | _branch_id uuid, _days integer | f | t | f |
| `dashboard_upcoming` | _branch_id uuid, _limit integer | f | t | f |
| `doctor_next_available_date` | _doctor_id uuid, _branch_id uuid | t | t | f |
| `doctor_occupancy` | _branch_id uuid, _days integer | f | t | f |
| `enqueue_appointment_confirmation` | () | f | f | f |
| `enqueue_appointment_reminders` | () | f | f | f |
| `escalate_ai_to_inbox` | _conversation_id uuid, _reason text, _severity text, _lang t | f | t | f |
| `estimate_appointment_cost` | _doctor_id uuid, _provider_id uuid | t | t | f |
| `evaluate_permission_error_spike` | _warn_ratio numeric, _rollback_ratio numeric, _min_observed_ | f | f | f |
| `g3_trigger_classify_complaint` | () | f | t | f |
| `generate_appointment_reference` | () | t | t | t |
| `generate_mrn` | _branch_id uuid | f | t | f |
| `generate_service_inquiry_number` | () | f | f | f |
| `get_ai_escalation_status` | _conversation_id uuid | t | t | f |
| `get_my_doctor_id` | () | t | t | f |
| `get_my_patient_id` | () | f | t | f |
| `get_order_by_ref` | _ref text, _phone text, _kind text | t | t | f |
| `get_public_doctor_rating_summary` | _doctor_id uuid | t | t | f |
| `get_ratings_summary` | _branch_id uuid, _doctor_id uuid, _days integer | f | t | f |
| `handle_new_user` | () | f | f | f |
| `has_active_consent` | _patient_id uuid, _consent_type consent_type | t | t | f |
| `has_branch_access` | _user_id uuid, _branch_id uuid | f | t | f |
| `has_permission` | _user_id uuid, _permission_key text | f | t | f |
| `has_permission_in_branch` | _user_id uuid, _permission_key text, _branch_id uuid | t | t | f |
| `has_resource_permission` | _user_id uuid, _kind resource_kind, _resource_id uuid, _min  | f | t | f |
| `has_role` | _user_id uuid, _role app_role | t | t | f |
| `has_role_in_branch` | _user_id uuid, _role app_role, _branch_id uuid | t | t | f |
| `inbox_ingest_appointment` | () | f | f | f |
| `inbox_ingest_complaint` | () | f | f | f |
| `inbox_ingest_corporate` | () | f | f | f |
| `inbox_ingest_home_care` | () | f | f | f |
| `inbox_ingest_medicine_order` | () | f | f | f |
| `inbox_ingest_second_opinion` | () | f | f | f |
| `inbox_ingest_service_inquiry` | () | f | f | f |
| `inbox_ingest_waitlist` | () | f | f | f |
| `is_global_role` | _user_id uuid, _role app_role | t | t | f |
| `is_inquiry_staff` | _user_id uuid | t | t | f |
| `link_guest_appointments` | () | f | t | f |
| `list_ai_incident_events` | _incident_id uuid | f | t | f |
| `list_ai_safety_incidents` | _conversation_id uuid | f | t | f |
| `list_appointment_audit_by_ref` | _ref text, _phone text | t | t | f |
| `list_doctor_leaves` | _from date, _to date, _branch_id uuid, _doctor_id uuid | f | t | f |
| `list_doctors_next_slot` | _doctor_ids uuid[] | t | t | f |
| `list_permissions_catalog` | () | f | t | f |
| `list_pharmacy_prescriptions` | _branch_id uuid, _status text | f | t | f |
| `list_public_branches` | () | t | t | f |
| `list_public_branches_for_rating` | () | t | t | f |
| `list_public_doctor_ratings` | _doctor_id uuid, _limit integer | t | t | f |
| `list_public_doctors` | _specialty_slug text, _branch_id uuid, _gender text, _langua | t | t | f |
| `list_public_doctors_for_rating` | _branch_id uuid | t | t | f |
| `list_public_excellence_centers` | _branch_id uuid | t | t | f |
| `list_reminder_preferences_by_ref` | _ref text, _phone text | t | t | f |
| `list_role_permission_audit` | _limit integer, _offset integer | f | t | f |
| `list_role_permissions_matrix` | () | f | t | f |
| `list_users_with_roles` | () | f | t | f |
| `log_appointment_change` | () | f | f | f |
| `log_appointment_status_change` | () | f | f | f |
| `log_auth_event` | _action text, _user_id uuid, _email text, _ip text, _ua text | t | t | f |
| `log_reminder_preference_change` | () | f | f | f |
| `log_security_event` | _action text, _appointment_id uuid, _from_status text, _to_s | f | t | f |
| `log_security_event` | _action text, _appointment_id uuid, _from_status text, _to_s | f | f | f |
| `lookup_appointment` | _ref text, _phone text | t | t | f |
| `lookup_complaint` | _ref text, _phone text | t | t | f |
| `mark_notifications_read` | _ids uuid[] | f | t | f |
| `mark_waitlist_on_slot_release` | () | f | f | f |
| `my_appointments` | () | f | t | f |
| `my_appointments_with_reminders` | () | f | t | f |
| `my_notifications` | _limit integer | f | t | f |
| `my_reminder_preference_audit` | _appointment_id uuid | f | t | f |
| `notify_on_reminder_preference_change` | () | f | f | f |
| `patient_qr_scan_stats` | _patient_ids uuid[] | f | t | f |
| `pharmacy_review_prescription` | _id uuid, _decision text, _notes text, _item_id uuid, _quant | f | t | f |
| `recon_adj_prevent_core_edits` | () | f | f | f |
| `record_permission_error` | _status_code smallint, _route text, _sqlstate text, _message | t | t | f |
| `refresh_bi_daily_kpis` | _days_back integer | f | f | f |
| `refresh_doctor_rating` | () | f | f | f |
| `release_expired_slot_holds` | () | f | f | f |
| `release_slot` | p_appointment_id uuid | f | t | f |
| `reply_to_rating` | _id uuid, _reply text | f | t | f |
| `reschedule_appointment_by_ref` | _ref text, _phone text, _new_date date, _new_time time witho | t | t | f |
| `revoke_user_role` | _user_id uuid, _role app_role, _ip text, _ua text | f | t | f |
| `service_inquiry_updates_block_mutation` | () | f | f | f |
| `set_role_permission` | _role app_role, _permission_key text, _enabled boolean | f | t | f |
| `set_verified_phone` | _user_id uuid, _phone text | f | f | f |
| `specialty_doctor_counts` | () | t | t | f |
| `staff_set_dependent_verification` | _dependent uuid, _status text, _method text, _notes text | f | t | f |
| `submit_public_rating` | _branch_id uuid, _doctor_id uuid, _rating smallint, _comment | t | t | f |
| `suggest_overbooking` | _from date, _to date | f | t | f |
| `sync_dependent_from_verification_request` | () | t | t | f |
| `sync_doctor_primary_branch` | () | f | f | f |
| `sync_on_refund_processed` | () | f | f | f |
| `sync_queue_entry_on_appointment_status` | () | f | f | f |
| `tg_write_audit_log` | () | f | f | f |
| `track_appointment` | _ref text, _phone_last4 text | t | t | f |
| `track_orders_by_phone` | _phone text, _reference text | t | t | f |
| `transition_insurance_approval` | _approval_id uuid, _to_status text, _note text, _meta jsonb | f | t | f |
| `trg_appointments_notify` | () | f | f | f |
| `trg_order_status_notify` | () | f | f | f |
| `trg_set_no_show_risk` | () | f | f | f |
| `trg_waitlist_on_appt_cancel` | () | f | f | f |
| `try_fill_waitlist_slot` | _doctor_id uuid, _branch_id uuid, _date date, _time time wit | f | f | f |
| `update_reminders_by_ref` | _ref text, _phone text, _reminder_24h boolean, _reminder_2h  | t | t | f |
| `user_branch_ids` | _user_id uuid | t | t | f |
| `user_in_org` | _user_id uuid, _org_id uuid | f | t | f |
| `user_org_ids` | _user_id uuid | f | t | f |
| `verify_appointment_by_reference` | _reference text, _phone_last4 text | t | t | f |
| `(139 rows)` | () |  |  |  |
