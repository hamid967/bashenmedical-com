-- ============================================================================
-- REVOKE Migration — G2 / G3 / G4 (SECURITY DEFINER hardening)
--
-- Scope:
--   G2 — Authenticated user helpers that must not be callable by public/anon.
--   G3 — Staff/admin RPCs; strip PUBLIC & anon, keep authenticated (inner
--        has_role/has_permission gate rejects non-staff callers).
--   G4 — Internal trigger/callback helpers; strip ALL external EXECUTE.
--
-- Not included on purpose:
--   - has_role / has_permission / has_branch_access / has_resource_permission:
--     invoked from anon-visible RLS policies (branches / doctors / specialties);
--     revoking anon EXECUTE would break public catalog reads.
--   - Guest RPCs (book_appointment_atomic, book_slot, confirm_waitlist_offer,
--     track_orders_by_phone, estimate_appointment_cost, lookup_*, list_public_*):
--     part of Group G1 (public), intentionally callable by anon.
--
-- Rollback: `GRANT EXECUTE ON FUNCTION <sig> TO <role>;` for any function below.
-- ============================================================================

-- =============================================================
-- G2 — Authenticated-only helpers (content editing)
-- Reason: these decide whether the *current* editor may write a
--         page/service. Anonymous callers have no reason to invoke.
-- =============================================================

-- Editor permission on a custom page (invoked by owner site-builder UI).
REVOKE EXECUTE ON FUNCTION public.can_edit_page(_user_id uuid, _page_id uuid) FROM PUBLIC, anon;

-- Editor permission on a service catalog entry.
REVOKE EXECUTE ON FUNCTION public.can_edit_service(_user_id uuid, _service_id uuid) FROM PUBLIC, anon;

-- =============================================================
-- G3 — Staff/admin RPCs (dashboards, RBAC admin, pharmacy, ratings mgmt)
-- Reason: return operational/PII data; caller must be signed in and
--         pass the internal has_role / has_permission check.
--         REVOKE from PUBLIC + anon is idempotent defence-in-depth.
-- =============================================================

-- --- RBAC administration ---
REVOKE EXECUTE ON FUNCTION public.list_users_with_roles()                                                                                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_role_permissions_matrix()                                                                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_role_permission_audit(_limit integer, _offset integer)                                               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_permissions_catalog()                                                                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_role_permission(_role app_role, _permission_key text, _enabled boolean)                               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assign_user_role(_user_id uuid, _role app_role, _branch_id uuid, _ip text, _ua text)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_user_role(_user_id uuid, _role app_role, _ip text, _ua text)                                       FROM PUBLIC, anon;

-- --- Analytics dashboards (branch/admin scope) ---
REVOKE EXECUTE ON FUNCTION public.dashboard_kpis(_branch_id uuid)                                                                           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_appointments_daily(_branch_id uuid, _days integer)                                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_by_specialty(_branch_id uuid, _days integer)                                                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_peak_hours(_branch_id uuid, _days integer)                                                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_recent_activity(_branch_id uuid, _limit integer)                                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_status_breakdown(_branch_id uuid, _days integer)                                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_upcoming(_branch_id uuid, _limit integer)                                                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.doctor_occupancy(_branch_id uuid, _days integer)                                                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.suggest_overbooking(_from date, _to date)                                                                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.patient_qr_scan_stats(_patient_ids uuid[])                                                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_ratings_summary(_branch_id uuid, _doctor_id uuid, _days integer)                                      FROM PUBLIC, anon;

-- --- Pharmacy & clinical operations ---
REVOKE EXECUTE ON FUNCTION public.list_pharmacy_prescriptions(_branch_id uuid, _status text)                                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pharmacy_review_prescription(_id uuid, _decision text, _notes text, _item_id uuid, _quantity integer)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_doctor_leaves(_from date, _to date, _branch_id uuid, _doctor_id uuid)                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reply_to_rating(_id uuid, _reply text)                                                                    FROM PUBLIC, anon;

-- --- Auth / security audit ---
REVOKE EXECUTE ON FUNCTION public.log_auth_event(_action text, _user_id uuid, _email text, _ip text, _ua text, _metadata jsonb)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_security_event(_action text, _appointment_id uuid, _from_status text, _to_status text, _reason text, _metadata jsonb, _ip_address text, _user_agent text) FROM PUBLIC, anon;

-- =============================================================
-- G4 — Internal helpers & trigger callbacks
-- Reason: invoked by row/statement triggers or by other SECURITY
--         DEFINER functions. Triggers ignore EXECUTE ACL, so
--         stripping all external EXECUTE closes the RPC surface
--         without breaking behaviour.
-- =============================================================

-- Trigger guard that still leaks EXECUTE to public/anon/authenticated:
REVOKE EXECUTE ON FUNCTION public._guard_profile_verified_phone()                                                                           FROM PUBLIC, anon, authenticated;

-- Internal predicates & assertions (no external caller):
REVOKE EXECUTE ON FUNCTION public._appointment_belongs_to_me(_phone text)                                                                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._assert_branch_access(_branch_id uuid)                                                                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._assert_slot_free(_doctor_id uuid, _date date, _time time without time zone, _exclude_appt_id uuid)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._assert_staff()                                                                                           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._emit_appointment_notification(_appt appointments, _kind text, _title text, _body text)                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._enforce_owner_cancel_only()                                                                              FROM PUBLIC, anon, authenticated;

-- Trigger functions (fired by AFTER/BEFORE triggers only):
REVOKE EXECUTE ON FUNCTION public.audit_row_change()                                                                                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_appointment_confirmation()                                                                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_appointment_reminders()                                                                           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                                                                                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_appointment_change()                                                                                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_appointment_status_change()                                                                           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_reminder_preference_change()                                                                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_waitlist_on_slot_release()                                                                           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_reminder_preference_change()                                                                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_doctor_rating()                                                                                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_expired_slot_holds()                                                                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.service_inquiry_updates_block_mutation()                                                                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_doctor_primary_branch()                                                                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_on_refund_processed()                                                                                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_write_audit_log()                                                                                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_appointments_notify()                                                                                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_order_status_notify()                                                                                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_set_no_show_risk()                                                                                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_waitlist_on_appt_cancel()                                                                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.try_fill_waitlist_slot(_doctor_id uuid, _branch_id uuid, _date date, _time time without time zone)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_service_inquiry_number()                                                                         FROM PUBLIC, anon, authenticated;

-- Trigger helper called only from a BEFORE INSERT on profiles:
REVOKE EXECUTE ON FUNCTION public.set_verified_phone(_user_id uuid, _phone text)                                                            FROM PUBLIC, anon, authenticated;

-- Older overload of log_security_event (6-arg); superseded by 8-arg variant:
REVOKE EXECUTE ON FUNCTION public.log_security_event(_action text, _appointment_id uuid, _from_status text, _to_status text, _reason text, _metadata jsonb) FROM PUBLIC, anon, authenticated;
