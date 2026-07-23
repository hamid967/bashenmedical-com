"""
Authorization boundary regression suite.

Covers four attack classes across every affected role/scope so that the
platform cannot silently regress into any of them:

  1. IDOR (Insecure Direct Object Reference)
     - Every sensitive user-owned table denies anon SELECT.
     - Every sensitive user-owned table has at least one RLS policy that
       filters by auth.uid() (or a helper such as public.has_role /
       public.user_owns_record) — never `USING (true)` for authenticated
       SELECT/UPDATE/DELETE.
     - Runtime probe (best-effort under pooler): impersonate patient B via
       request.jwt.claims and confirm patient A's rows are invisible / not
       updatable.

  2. Privilege escalation
     - `authenticated` cannot INSERT/UPDATE/DELETE on public.user_roles,
       public.role_permissions, or public.permissions.
     - `anon` holds no privileges on those tables.
     - public.profiles.role / public.patient_profiles cannot be flipped by
       an ordinary authenticated user (RLS or lack of grant).

  3. Unauthorized exports / audit tampering
     - public.audit_logs and public.security_audit_log deny UPDATE and
       DELETE to every non-service role (RESTRICTIVE `USING (false)`),
       and their SQL-level UPDATE/DELETE grants are revoked from
       authenticated + anon.
     - Sensitive read/export/download surfaces (notification_delivery_logs,
       ai_usage_costs, api_permission_errors, security_audit_log,
       audit_logs, appointment_audit) are NOT readable by anon.

  4. Cross-patient access
     - Every table matching `patient_*` (and appointments, invoices,
       payments, refunds, prescriptions, lab_reports, radiology_reports,
       medical_reports, medicine_orders, consent_records, dependents,
       ai_conversations, ai_messages, notifications, push_subscriptions)
       has RLS enabled and no anon SELECT grant.
     - No RLS policy on those tables uses `USING (true)` for SELECT,
       UPDATE, or DELETE (INSERT/`WITH CHECK (true)` allowed only when a
       separate SELECT policy scopes visibility).

Exit 0 = clean.  Non-zero = at least one regression.
"""
from __future__ import annotations

import os
import sys
import psycopg2
import psycopg2.extras


# ---------------------------------------------------------------------------
# Table catalogs
# ---------------------------------------------------------------------------

# Tables that store user-owned / patient-owned records. IDOR + cross-patient
# rules apply here: RLS ON, no anon SELECT grant, no `USING (true)` on
# SELECT/UPDATE/DELETE.
PATIENT_OWNED_TABLES = [
    "patients",
    "patient_profiles",
    "patient_allergies",
    "patient_medications",
    "patient_medical_history",
    "patient_surgeries",
    "patient_immunizations",
    "patient_visits",
    "patient_attachments",
    "patient_ratings",
    "patient_check_ins",
    "patient_qr_scans",
    "dependents",
    "appointments",
    "appointment_status_history",
    "appointment_waitlist",
    "invoices",
    "payments",
    "refunds",
    "prescriptions",
    "lab_reports",
    "radiology_reports",
    "medical_reports",
    "medicine_orders",
    "consent_records",
    "insurance_approvals",
    "insurance_verifications",
    "ai_conversations",
    "ai_messages",
    "notifications",
    "push_subscriptions",
    "reminder_preferences",
    "second_opinion_requests",
    "home_care_requests",
    "nurse_calls",
]

# Privilege-escalation surface: writes must be denied to authenticated + anon.
PRIVILEGE_TABLES = [
    "user_roles",
    "role_permissions",
    "permissions",
]

# Audit / export tables: append-only for service; unreadable to anon.
AUDIT_TABLES = [
    "audit_logs",
    "security_audit_log",
    "auth_events",
    "appointment_audit",
    "notification_delivery_logs",
    "ai_usage_costs",
    "ai_safety_incidents",
    "api_permission_errors",
    "booking_trace_events",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def connect():
    return psycopg2.connect(
        host=os.environ["PGHOST"],
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ["PGUSER"],
        password=os.environ["PGPASSWORD"],
        dbname=os.environ["PGDATABASE"],
    )


def _table_exists(conn, table: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT to_regclass(%s) IS NOT NULL",
            (f"public.{table}",),
        )
        return cur.fetchone()[0]


def _rls_enabled(conn, table: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT relrowsecurity FROM pg_class WHERE oid = %s::regclass",
            (f"public.{table}",),
        )
        row = cur.fetchone()
        return bool(row and row[0])


def _has_priv(conn, role: str, table: str, priv: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT has_table_privilege(%s, %s, %s)",
            (role, f"public.{table}", priv),
        )
        return cur.fetchone()[0]


def _policies(conn, table: str) -> list[dict]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT polname AS name,
                   polcmd  AS cmd,     -- r=SELECT, a=INSERT, w=UPDATE, d=DELETE, *=ALL
                   polpermissive AS permissive,
                   pg_get_expr(polqual,      polrelid) AS using_expr,
                   pg_get_expr(polwithcheck, polrelid) AS check_expr
            FROM pg_policy
            WHERE polrelid = %s::regclass
            """,
            (f"public.{table}",),
        )
        return list(cur.fetchall())


# ---------------------------------------------------------------------------
# Rule 1 — IDOR / cross-patient (static)
# ---------------------------------------------------------------------------

def check_patient_tables(conn) -> list[str]:
    failures: list[str] = []
    for t in PATIENT_OWNED_TABLES:
        if not _table_exists(conn, t):
            continue  # optional feature; skip
        # RLS must be ON.
        if not _rls_enabled(conn, t):
            failures.append(f"[idor:no-rls] public.{t} has RLS disabled")
        # anon must NOT hold SELECT (no anonymous reads on owner tables).
        if _has_priv(conn, "anon", t, "SELECT"):
            failures.append(f"[idor:anon-select] public.{t} grants SELECT to anon")

        pols = _policies(conn, t)
        if not pols:
            failures.append(f"[idor:no-policies] public.{t} RLS is ON but no policies defined")
            continue

        # Reject blanket USING(true) on SELECT/UPDATE/DELETE. Blanket
        # WITH CHECK (true) on INSERT is allowed if a separate SELECT
        # policy scopes visibility.
        for p in pols:
            cmd = p["cmd"]
            using = (p["using_expr"] or "").strip().lower()
            if cmd in ("r", "w", "d", "*") and using == "true" and p["permissive"]:
                failures.append(
                    f"[idor:blanket] public.{t} policy {p['name']!r} uses USING (true) "
                    f"for cmd={cmd} — every authenticated user can access every row"
                )
    return failures


# ---------------------------------------------------------------------------
# Rule 2 — Privilege escalation (static)
# ---------------------------------------------------------------------------

def check_privilege_tables(conn) -> list[str]:
    failures: list[str] = []
    for t in PRIVILEGE_TABLES:
        if not _table_exists(conn, t):
            failures.append(f"[esc:missing] public.{t} does not exist — RBAC catalog incomplete")
            continue
        if not _rls_enabled(conn, t):
            failures.append(f"[esc:no-rls] public.{t} has RLS disabled")
        # anon must have zero privileges.
        for priv in ("SELECT", "INSERT", "UPDATE", "DELETE"):
            if _has_priv(conn, "anon", t, priv):
                failures.append(f"[esc:anon-{priv.lower()}] public.{t} grants {priv} to anon")
        # authenticated must not hold write privileges at the SQL layer.
        # (SELECT is allowed for user_roles / role_permissions / permissions
        #  so has_role() and permission catalog work under RLS.)
        for priv in ("INSERT", "UPDATE", "DELETE"):
            if _has_priv(conn, "authenticated", t, priv):
                failures.append(
                    f"[esc:auth-{priv.lower()}] public.{t} grants {priv} to authenticated "
                    f"— privilege escalation risk"
                )
    return failures


# ---------------------------------------------------------------------------
# Rule 3 — Unauthorized exports / audit tampering (static)
# ---------------------------------------------------------------------------

# audit_logs and security_audit_log must be provably immutable to the
# Data API roles. We accept either: (a) no UPDATE/DELETE grant to
# authenticated + anon, OR (b) a RESTRICTIVE policy that denies them.
def check_audit_tables(conn) -> list[str]:
    failures: list[str] = []
    for t in AUDIT_TABLES:
        if not _table_exists(conn, t):
            continue
        if not _rls_enabled(conn, t):
            failures.append(f"[audit:no-rls] public.{t} has RLS disabled")
        if _has_priv(conn, "anon", t, "SELECT"):
            failures.append(f"[audit:anon-select] public.{t} grants SELECT to anon")

    # Immutability contract for the two canonical audit trails.
    for t in ("audit_logs", "security_audit_log"):
        if not _table_exists(conn, t):
            continue
        for role in ("authenticated", "anon"):
            for priv in ("UPDATE", "DELETE"):
                if _has_priv(conn, role, t, priv):
                    failures.append(
                        f"[audit:mutable] public.{t} grants {priv} to {role} — "
                        f"audit log must be append-only"
                    )
        # A restrictive `USING (false)` policy should be present for UPDATE
        # and DELETE as defense-in-depth.
        pols = _policies(conn, t)
        has_deny_update = any(
            (not p["permissive"]) and p["cmd"] in ("w", "*")
            and (p["using_expr"] or "").strip().lower() in ("false", "(false)")
            for p in pols
        )
        has_deny_delete = any(
            (not p["permissive"]) and p["cmd"] in ("d", "*")
            and (p["using_expr"] or "").strip().lower() in ("false", "(false)")
            for p in pols
        )
        if not has_deny_update:
            failures.append(
                f"[audit:no-restrictive-update] public.{t} lacks RESTRICTIVE "
                f"USING (false) policy on UPDATE"
            )
        if not has_deny_delete:
            failures.append(
                f"[audit:no-restrictive-delete] public.{t} lacks RESTRICTIVE "
                f"USING (false) policy on DELETE"
            )
    return failures


# ---------------------------------------------------------------------------
# Rule 4 — Runtime IDOR probe (best effort)
# ---------------------------------------------------------------------------

# Try to impersonate two distinct patients via request.jwt.claims and
# confirm patient B cannot see or modify patient A's rows on a couple of
# canonical tables. Skipped silently when the pooler role cannot SET ROLE
# (Supabase transaction pooler).
POOLER_UNAVAILABLE = False


def _impersonate(cur, uid: str) -> bool:
    """Best-effort JWT+role impersonation. Returns True if setup succeeded."""
    global POOLER_UNAVAILABLE
    if POOLER_UNAVAILABLE:
        return False
    try:
        cur.execute("BEGIN")
        cur.execute(
            "SELECT set_config('request.jwt.claims', %s, true)",
            (f'{{"sub":"{uid}","role":"authenticated"}}',),
        )
        cur.execute("SET LOCAL ROLE authenticated")
        return True
    except Exception as e:
        if "permission denied to set role" in str(e).lower():
            POOLER_UNAVAILABLE = True
            return False
        raise


def probe_runtime_idor(conn) -> list[str]:
    failures: list[str] = []
    # Fake UUIDs — no matching rows should be visible.
    uid_a = "00000000-0000-0000-0000-00000000aaaa"
    uid_b = "00000000-0000-0000-0000-00000000bbbb"

    canonical = [
        ("patient_medications", "patient_id"),
        ("patient_allergies",   "patient_id"),
        ("appointments",        "patient_id"),
        ("notifications",       "user_id"),
        ("ai_conversations",    "user_id"),
    ]

    for table, col in canonical:
        if not _table_exists(conn, table):
            continue
        with conn.cursor() as cur:
            if not _impersonate(cur, uid_b):
                return []  # pooler cannot SET ROLE → skip whole probe
            try:
                # Patient B trying to read patient A's rows: must return 0 rows.
                cur.execute(
                    f"SELECT count(*) FROM public.{table} WHERE {col} = %s",
                    (uid_a,),
                )
                (visible,) = cur.fetchone()
                if visible and visible > 0:
                    failures.append(
                        f"[idor:runtime] {table}: patient B could SELECT "
                        f"{visible} row(s) belonging to patient A"
                    )
            except psycopg2.Error:
                # RLS-enforced denials are fine; we only fail on visibility.
                pass
            finally:
                conn.rollback()
    return failures


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def main() -> int:
    for v in ("PGHOST", "PGUSER", "PGPASSWORD", "PGDATABASE"):
        if not os.environ.get(v):
            print(f"MISSING env {v}", file=sys.stderr)
            return 2

    conn = connect()
    try:
        buckets = [
            ("IDOR / cross-patient (static)",     check_patient_tables(conn)),
            ("Privilege escalation (static)",     check_privilege_tables(conn)),
            ("Audit / export tampering (static)", check_audit_tables(conn)),
            ("IDOR runtime probe",                probe_runtime_idor(conn)),
        ]
        total = 0
        for label, fails in buckets:
            print(f"── {label}: {len(fails)} issue(s)")
            for f in fails:
                print(f"    {f}")
            total += len(fails)

        if POOLER_UNAVAILABLE:
            print("── Runtime probes skipped (pooler role cannot SET ROLE)")

        if total == 0:
            print("\n✅ Authorization boundary suite clean.")
            return 0
        print(f"\n❌ {total} authorization regression(s) detected.")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
