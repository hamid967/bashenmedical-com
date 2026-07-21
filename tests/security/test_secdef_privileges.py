"""
Security test suite: verify EXECUTE privileges on SECURITY DEFINER functions.

Goals:
  1. No `_`-prefixed (internal/trigger) function is callable by `anon` or `PUBLIC`.
  2. No `SECURITY DEFINER` function is callable by `PUBLIC` role
     (grants must be explicit to `anon`/`authenticated`/`service_role`).
  3. Runtime probe: SET ROLE anon and try invoking known-revoked functions;
     expect `permission denied`.

Runs against the Supabase Postgres DB using the standard PG* env vars.
Exit code 0 = all clear. Non-zero = at least one violation.
"""
from __future__ import annotations

import os
import sys
import psycopg2
import psycopg2.extras


# Functions that are intentionally public-readable (safe, narrow, or
# behind their own logic). Everything else callable by `anon` is a leak
# if it starts with `_` or is a privileged writer.
PUBLIC_READ_ALLOWLIST = {
    "search_doctors",
    "get_public_doctor",
    "get_public_doctor_rating_summary",
    "get_available_slots",
    "check_slot_hold",
    "list_public_branches",
    "list_branches_public",
    "list_specialties_public",
    "list_doctors_next_slot",
    "doctor_next_available_date",
    "get_health_articles_public",
    "get_faqs_public",
    "estimate_appointment_cost",   # public price estimator
    "track_orders_by_phone",       # OTP-guarded internally
    "get_order_by_ref",            # OTP-guarded internally
    "cancel_order_by_ref",         # OTP-guarded internally
    "cancel_appointment_by_ref",   # OTP-guarded internally
    "list_appointment_audit_by_ref",
    "confirm_waitlist_offer",      # OTP-guarded internally
    "claim_service_inquiry",       # token-guarded
    "book_slot",                   # guest booking path
    "book_appointment_atomic",     # guest booking path
    "has_active_consent",
    "has_role",                    # RPC used by front-end during hydration
    "get_my_roles",
    "get_my_doctor_id",
    "is_inquiry_staff",
}

# Functions we expect to be REVOKED from anon (runtime probe list).
# Must start denied — if any becomes callable, regression.
REVOKED_FROM_ANON_PROBES = [
    ("_guard_profile_verified_phone", "()"),
]


def connect():
    return psycopg2.connect(
        host=os.environ["PGHOST"],
        port=os.environ.get("PGPORT", "5432"),
        user=os.environ["PGUSER"],
        password=os.environ["PGPASSWORD"],
        dbname=os.environ["PGDATABASE"],
    )


def fetch_secdef(conn) -> list[dict]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT p.oid, p.proname AS name,
                   pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
                   has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
                   has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec,
                   has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.prosecdef = true
            ORDER BY p.proname;
            """
        )
        return list(cur.fetchall())


def check_no_internal_leaks(rows: list[dict]) -> list[str]:
    """Rule 1: `_`-prefixed functions must not be anon/PUBLIC callable."""
    bad = []
    for r in rows:
        if r["name"].startswith("_"):
            if r["anon_exec"]:
                bad.append(f"[INTERNAL→anon]   {r['name']}({r['args']})")
            if r["public_exec"]:
                bad.append(f"[INTERNAL→PUBLIC] {r['name']}({r['args']})")
    return bad


def check_no_public_grants(rows: list[dict]) -> list[str]:
    """Rule 2: no SECURITY DEFINER function may be executable by PUBLIC role.

    PUBLIC includes every role automatically; grants must be scoped to
    anon/authenticated/service_role explicitly.
    """
    return [
        f"[PUBLIC-leak] {r['name']}({r['args']})"
        for r in rows
        if r["public_exec"]
    ]


def check_anon_only_allowlisted(rows: list[dict]) -> list[str]:
    """Rule 3: functions callable by anon must be on the explicit allowlist."""
    return [
        f"[anon-unlisted] {r['name']}({r['args']})"
        for r in rows
        if r["anon_exec"] and r["name"] not in PUBLIC_READ_ALLOWLIST
        and not r["name"].startswith("_")  # underscore already caught above
    ]


def probe_denied_as_anon(conn, probes: list[tuple[str, str]]) -> list[str]:
    """Runtime probe: SET ROLE anon and expect permission denied on each fn."""
    failures = []
    for fn, args in probes:
        with conn.cursor() as cur:
            try:
                cur.execute("BEGIN")
                cur.execute("SET LOCAL ROLE anon")
                cur.execute(f"SELECT public.{fn}{args}")
                # If we got here, it did NOT deny — that's a failure.
                failures.append(f"[runtime-allowed] anon could execute {fn}{args}")
                cur.execute("ROLLBACK")
            except psycopg2.errors.InsufficientPrivilege:
                conn.rollback()  # expected
            except Exception as e:
                # Any other error (e.g. function threw internally) still
                # proves EXECUTE succeeded — that's a failure too, unless
                # it's a signature mismatch.
                conn.rollback()
                msg = str(e).lower()
                if "does not exist" in msg or "no function matches" in msg:
                    failures.append(f"[signature-drift] {fn}{args}: {e}")
                elif "permission denied" in msg:
                    pass  # expected
                else:
                    failures.append(f"[runtime-executed] anon ran {fn}{args}, threw: {e}")
    return failures


def main() -> int:
    for v in ("PGHOST", "PGUSER", "PGPASSWORD", "PGDATABASE"):
        if not os.environ.get(v):
            print(f"MISSING env {v}", file=sys.stderr)
            return 2

    conn = connect()
    try:
        rows = fetch_secdef(conn)
        print(f"Scanned {len(rows)} SECURITY DEFINER functions in public schema.\n")

        internal = check_no_internal_leaks(rows)
        public_leaks = check_no_public_grants(rows)
        anon_unlisted = check_anon_only_allowlisted(rows)
        runtime = probe_denied_as_anon(conn, REVOKED_FROM_ANON_PROBES)

        sections = [
            ("Internal helpers exposed", internal),
            ("Granted to PUBLIC role", public_leaks),
            ("Anon-callable but not allowlisted", anon_unlisted),
            ("Runtime probe (anon)", runtime),
        ]
        total = 0
        for title, items in sections:
            print(f"── {title}: {len(items)} issue(s)")
            for i in items:
                print(f"    {i}")
            total += len(items)
            print()

        if total == 0:
            print("✅ All SECDEF privilege checks passed.")
            return 0
        print(f"❌ {total} privilege violation(s) detected.")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
