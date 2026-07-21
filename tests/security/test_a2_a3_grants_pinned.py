#!/usr/bin/env python3
"""
Post-merge guard: verify EXECUTE remains REVOKED from PUBLIC / anon on the
specific set of functions hardened in Batch A2 and A3.

Unlike `test_secdef_privileges.py` (which enforces a generic allowlist rule
for every SECURITY DEFINER function), this script pins an explicit list of
functions we know were revoked, so any silent re-grant (via a later migration,
manual GRANT, or CREATE OR REPLACE that resets ACL) fails the build.

Runs on push to main after migrations have been applied. Exits non-zero on
any regression.
"""
from __future__ import annotations

import os
import sys
from typing import Iterable

import psycopg2

# --- Targeted functions from Batch A2 & A3 --------------------------------
# Format: fully-qualified name (schema.name). Overloads are all checked.
# If a function on this list is callable by PUBLIC or anon, that is a
# regression of A2/A3 and the job must fail.

A2_G2_AUTH_HELPERS = [
    "public.can_edit_page",
    "public.can_edit_service",
]

A2_G3_STAFF_RPCS = [
    "public.admin_list_service_inquiries",
    "public.admin_get_service_inquiry",
    "public.admin_update_service_inquiry_status",
    "public.admin_assign_service_inquiry",
    "public.admin_bulk_update_service_inquiries",
    "public.admin_delete_service_inquiry",
    "public.admin_export_service_inquiries",
    "public.admin_service_inquiry_stats",
    "public.admin_list_roles",
    "public.admin_grant_role",
    "public.admin_revoke_role",
    "public.admin_list_branches",
    "public.admin_list_pharmacy_orders",
    "public.admin_update_pharmacy_order",
    "public.admin_list_home_care_requests",
    "public.admin_update_home_care_request",
    "public.admin_list_clinical_notes",
    "public.admin_upsert_clinical_note",
    "public.admin_list_appointments",
    "public.admin_reschedule_appointment",
    "public.admin_cancel_appointment",
]

A2_G4_INTERNAL = [
    "public.audit_row_change",
    "public.handle_new_user",
    "public._assert_staff",
    "public._assert_admin",
    "public._assert_super_admin",
    "public._touch_updated_at",
    "public._guard_profile_verified_phone",
]

A3_SEALED = [
    "public._purge_old_permission_errors",
    "public.evaluate_permission_error_spike",
    "public.has_resource_permission",
]

# Functions re-granted explicitly to anon+authenticated (not PUBLIC).
# We only assert PUBLIC is NOT a grantee — anon may be.
A3_EXPLICIT_ANON_ONLY_NOT_PUBLIC = [
    "public.book_appointment_atomic",
    "public.confirm_waitlist_offer",
    "public.estimate_appointment_cost",
    "public.track_orders_by_phone",
]

FULLY_REVOKED = (
    A2_G2_AUTH_HELPERS
    + A2_G3_STAFF_RPCS
    + A2_G4_INTERNAL
    + A3_SEALED
)

# --- Query ----------------------------------------------------------------

SQL_GRANTS = """
SELECT
  n.nspname || '.' || p.proname AS fqname,
  pg_get_function_identity_arguments(p.oid) AS args,
  COALESCE(
    (
      SELECT string_agg(DISTINCT grantee, ',' ORDER BY grantee)
      FROM (
        SELECT
          CASE
            WHEN split_part(a::text, '=', 1) = '' THEN 'PUBLIC'
            ELSE split_part(a::text, '=', 1)
          END AS grantee,
          split_part(split_part(a::text, '=', 2), '/', 1) AS privs
        FROM unnest(COALESCE(p.proacl, ARRAY[]::aclitem[])) AS a
      ) g
      WHERE g.privs LIKE '%X%'
        AND g.grantee IN ('PUBLIC', 'anon')
    ),
    ''
  ) AS bad_grantees
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE (n.nspname || '.' || p.proname) = ANY(%s);
"""


def check(conn, names: Iterable[str], forbid_anon: bool = True) -> list[str]:
    violations: list[str] = []
    with conn.cursor() as cur:
        cur.execute(SQL_GRANTS, (list(names),))
        rows = cur.fetchall()
        found = {r[0] for r in rows}
        for missing in set(names) - found:
            # Function absent — not an A2 regression, but flag so the list
            # stays honest with schema evolution.
            print(f"  ⚠ not-found: {missing} (dropped or renamed — update this script)")
        for fqname, args, bad in rows:
            grantees = set(g for g in bad.split(",") if g)
            if not forbid_anon:
                grantees.discard("anon")
            if grantees:
                sig = f"{fqname}({args})"
                violations.append(f"{sig}  ← re-granted to: {', '.join(sorted(grantees))}")
    return violations


def main() -> int:
    if not os.environ.get("PGHOST"):
        print("::error::PGHOST not set — cannot run post-merge grants guard.")
        return 2

    conn = psycopg2.connect(sslmode=os.environ.get("PGSSLMODE", "require"))
    try:
        print(f"→ Checking {len(FULLY_REVOKED)} fully-revoked functions "
              "(PUBLIC and anon both forbidden)…")
        v1 = check(conn, FULLY_REVOKED, forbid_anon=True)

        print(f"→ Checking {len(A3_EXPLICIT_ANON_ONLY_NOT_PUBLIC)} anon-only functions "
              "(PUBLIC forbidden, anon allowed)…")
        v2 = check(conn, A3_EXPLICIT_ANON_ONLY_NOT_PUBLIC, forbid_anon=False)

        violations = v1 + v2
        if violations:
            print("\n❌ A2/A3 grant regressions detected:")
            for v in violations:
                print(f"  • {v}")
            print("\nA later migration or manual GRANT restored EXECUTE to "
                  "PUBLIC/anon on a hardened function. Add an explicit "
                  "REVOKE in a follow-up migration, or update this script "
                  "if the change is intentional (and update "
                  "docs/security/public_read_allowlist.md).")
            return 1

        print("\n✅ All A2/A3 revocations still in force. No regressions.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
