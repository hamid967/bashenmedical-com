-- ============================================================================
-- Batch A2 — Revoke EXECUTE from PUBLIC / anon on privileged SECURITY DEFINER
-- functions. Idempotent. Keeps RLS helpers required for public catalog reads
-- (e.g. has_role) untouched.
-- ============================================================================

-- =========================================================
-- G2 — content-editor helpers (auth-only)
-- =========================================================
REVOKE EXECUTE ON FUNCTION public.can_edit_page(uuid, uuid)                                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_service(uuid, uuid)                                FROM PUBLIC, anon;

-- =========================================================
-- G3 — staff/admin RPCs (authenticated only; role check inside)
-- =========================================================
REVOKE EXECUTE ON FUNCTION public.list_users_with_roles()                                                                                        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_role_permissions_matrix()                                                                                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_role_permission_audit(integer, integer)                                                                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_permissions_catalog()                                                                                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_role_permission(app_role, text, boolean)                                                                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assign_user_role(uuid, app_role, uuid, text, text)                                                             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_user_role(uuid, app_role, text, text)                                                                   FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.dashboard_kpis(uuid)                                                                                           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_appointments_daily(uuid, integer)                                                                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_by_specialty(uuid, integer)                                                                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_peak_hours(uuid, integer)                                                                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_recent_activity(uuid, integer)                                                                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_status_breakdown(uuid, integer)                                                                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_upcoming(uuid, integer)                                                                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.doctor_occupancy(uuid, integer)                                                                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.suggest_overbooking(date, date)                                                                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.patient_qr_scan_stats(uuid[])                                                                                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_ratings_summary(uuid, uuid, integer)                                                                       FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.list_pharmacy_prescriptions(uuid, text)                                                                        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pharmacy_review_prescription(uuid, text, text, uuid, integer)                                                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_doctor_leaves(date, date, uuid, uuid)                                                                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reply_to_rating(uuid, text)                                                                                    FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.log_auth_event(text, uuid, text, text, text, jsonb)                                                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_security_event(text, uuid, text, text, text, jsonb, text, text)                                            FROM PUBLIC, anon;

-- =========================================================
-- G4 — internal helpers & trigger callbacks (revoke from all external roles)
-- =========================================================
REVOKE EXECUTE ON FUNCTION public._appointment_belongs_to_me(text)                                                                               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._assert_branch_access(uuid)                                                                                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._assert_slot_free(uuid, date, time without time zone, uuid)                                                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._assert_staff()                                                                                                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._emit_appointment_notification(appointments, text, text, text)                                                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._enforce_owner_cancel_only()                                                                                   FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.audit_row_change()                                                                                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_appointment_confirmation()                                                                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_appointment_reminders()                                                                                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                                                                                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_appointment_change()                                                                                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_appointment_status_change()                                                                                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_reminder_preference_change()                                                                               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_waitlist_on_slot_release()                                                                                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_reminder_preference_change()                                                                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_doctor_rating()                                                                                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_expired_slot_holds()                                                                                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.service_inquiry_updates_block_mutation()                                                                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_doctor_primary_branch()                                                                                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_on_refund_processed()                                                                                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_write_audit_log()                                                                                           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_appointments_notify()                                                                                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_order_status_notify()                                                                                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_set_no_show_risk()                                                                                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_waitlist_on_appt_cancel()                                                                                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.try_fill_waitlist_slot(uuid, uuid, date, time without time zone)                                               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_service_inquiry_number()                                                                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_verified_phone(uuid, text)                                                                                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_security_event(text, uuid, text, text, text, jsonb)                                                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._guard_profile_verified_phone()                                                                                FROM PUBLIC, anon, authenticated;
