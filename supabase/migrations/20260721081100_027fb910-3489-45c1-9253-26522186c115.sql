-- ============================================================================
-- ROLLBACK migration — Reverses the A2 REVOKE hardening pass
--
-- Restores EXECUTE privileges to the exact grantees captured in the pre-A2
-- pg_proc.proacl snapshot. Apply only if a functional regression is proven
-- to be caused by the A2 REVOKE migration; otherwise leave hardened state in
-- place. All statements are idempotent.
-- ============================================================================

-- =============================================================
-- G2 — restore content-editor helpers to public
-- (pre-A2: PUBLIC + anon + authenticated all had EXECUTE)
-- =============================================================
GRANT EXECUTE ON FUNCTION public.can_edit_page(_user_id uuid, _page_id uuid)              TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_service(_user_id uuid, _service_id uuid)        TO PUBLIC, anon, authenticated;

-- =============================================================
-- G3 — restore staff/admin RPCs to their pre-A2 grantees
-- (pre-A2 snapshot: authenticated + PUBLIC (and anon by inheritance);
--  A2 revoked PUBLIC+anon, keeping authenticated. Rollback re-grants PUBLIC+anon.)
-- =============================================================

-- RBAC administration
GRANT EXECUTE ON FUNCTION public.list_users_with_roles()                                                                                        TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_role_permissions_matrix()                                                                                 TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_role_permission_audit(_limit integer, _offset integer)                                                    TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_permissions_catalog()                                                                                     TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_role_permission(_role app_role, _permission_key text, _enabled boolean)                                    TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_user_role(_user_id uuid, _role app_role, _branch_id uuid, _ip text, _ua text)                           TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_user_role(_user_id uuid, _role app_role, _ip text, _ua text)                                            TO PUBLIC, anon;

-- Analytics dashboards
GRANT EXECUTE ON FUNCTION public.dashboard_kpis(_branch_id uuid)                                                                                TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_appointments_daily(_branch_id uuid, _days integer)                                                   TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_by_specialty(_branch_id uuid, _days integer)                                                         TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_peak_hours(_branch_id uuid, _days integer)                                                           TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_recent_activity(_branch_id uuid, _limit integer)                                                     TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_status_breakdown(_branch_id uuid, _days integer)                                                     TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_upcoming(_branch_id uuid, _limit integer)                                                            TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doctor_occupancy(_branch_id uuid, _days integer)                                                               TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggest_overbooking(_from date, _to date)                                                                      TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_qr_scan_stats(_patient_ids uuid[])                                                                     TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ratings_summary(_branch_id uuid, _doctor_id uuid, _days integer)                                           TO PUBLIC, anon;

-- Pharmacy & clinical operations
GRANT EXECUTE ON FUNCTION public.list_pharmacy_prescriptions(_branch_id uuid, _status text)                                                     TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pharmacy_review_prescription(_id uuid, _decision text, _notes text, _item_id uuid, _quantity integer)          TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_doctor_leaves(_from date, _to date, _branch_id uuid, _doctor_id uuid)                                     TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reply_to_rating(_id uuid, _reply text)                                                                         TO PUBLIC, anon;

-- Auth / security audit
GRANT EXECUTE ON FUNCTION public.log_auth_event(_action text, _user_id uuid, _email text, _ip text, _ua text, _metadata jsonb)                  TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_security_event(_action text, _appointment_id uuid, _from_status text, _to_status text, _reason text, _metadata jsonb, _ip_address text, _user_agent text) TO PUBLIC, anon;

-- =============================================================
-- G4 — restore internal helpers & trigger callbacks
-- (pre-A2 default: EXECUTE granted to PUBLIC via Postgres default;
--  A2 revoked PUBLIC/anon/authenticated. Rollback re-grants PUBLIC.)
-- =============================================================

GRANT EXECUTE ON FUNCTION public._guard_profile_verified_phone()                                                                                TO PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._appointment_belongs_to_me(_phone text)                                                                        TO PUBLIC;
GRANT EXECUTE ON FUNCTION public._assert_branch_access(_branch_id uuid)                                                                         TO PUBLIC;
GRANT EXECUTE ON FUNCTION public._assert_slot_free(_doctor_id uuid, _date date, _time time without time zone, _exclude_appt_id uuid)            TO PUBLIC;
GRANT EXECUTE ON FUNCTION public._assert_staff()                                                                                                TO PUBLIC;
GRANT EXECUTE ON FUNCTION public._emit_appointment_notification(_appt appointments, _kind text, _title text, _body text)                        TO PUBLIC;
GRANT EXECUTE ON FUNCTION public._enforce_owner_cancel_only()                                                                                   TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.audit_row_change()                                                                                             TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_appointment_confirmation()                                                                             TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_appointment_reminders()                                                                                TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user()                                                                                              TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_appointment_change()                                                                                       TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_appointment_status_change()                                                                                TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_reminder_preference_change()                                                                               TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_waitlist_on_slot_release()                                                                                TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_on_reminder_preference_change()                                                                         TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_doctor_rating()                                                                                        TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_expired_slot_holds()                                                                                   TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.service_inquiry_updates_block_mutation()                                                                       TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_doctor_primary_branch()                                                                                   TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_on_refund_processed()                                                                                     TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_write_audit_log()                                                                                           TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.trg_appointments_notify()                                                                                      TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.trg_order_status_notify()                                                                                      TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.trg_set_no_show_risk()                                                                                         TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.trg_waitlist_on_appt_cancel()                                                                                  TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_fill_waitlist_slot(_doctor_id uuid, _branch_id uuid, _date date, _time time without time zone)             TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_service_inquiry_number()                                                                              TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_verified_phone(_user_id uuid, _phone text)                                                                 TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_security_event(_action text, _appointment_id uuid, _from_status text, _to_status text, _reason text, _metadata jsonb) TO PUBLIC;
