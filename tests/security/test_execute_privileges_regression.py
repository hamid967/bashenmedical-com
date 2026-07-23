"""
Regression tests for the two runtime permission failures fixed on 2026-07-23:

  1. `_appointment_belongs_to_me(text)` — invoked from the RLS policy on
     `public.appointments` for the authenticated role. If EXECUTE is
     revoked from `authenticated`, guests cannot read/cancel their own
     appointments (Postgres raises 42501 inside the policy).

  2. `log_auth_event(text, uuid, text, text, text, jsonb)` — called by a
     server function using the `anon` publishable key during
     login/signup, before a session exists. If EXECUTE is revoked from
     `anon`, every login/signup logs a `permission denied` error.

The suite covers both the static privilege catalog AND a runtime probe
via `SET LOCAL ROLE` so any future revoke is caught locally.

Exit 0 = clean. Non-zero = at least one violation.
"""
from __future__ import annotations

import os
import sys
import psycopg2


EXPECTED: list[tuple[str, str, dict[str, bool]]] = [
    # (function_name, signature, {role: should_have_execute})
    (
        "_appointment_belongs_to_me",
        "text",
        {"authenticated": True, "anon": False, "public": False},
    ),
    (
        "log_auth_event",
        "text, uuid, text, text, text, jsonb",
        {"authenticated": True, "anon": True, "public": False},
    ),
]


def connect() -> "psycopg2.extensions.connection":
    return psycopg2.connect(
        host=os.environ["PGHOST"],
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ["PGUSER"],
        password=os.environ["PGPASSWORD"],
        dbname=os.environ["PGDATABASE"],
    )


def check_static(conn) -> list[str]:
    """Read has_function_privilege() for each (fn, role) pair."""
    failures: list[str] = []
    with conn.cursor() as cur:
        for name, sig, roles in EXPECTED:
            for role, expected in roles.items():
                cur.execute(
                    "SELECT has_function_privilege(%s, %s, 'EXECUTE')",
                    (role, f"public.{name}({sig})"),
                )
                actual = cur.fetchone()[0]
                if actual is not expected:
                    failures.append(
                        f"[static] public.{name}({sig}) — role {role}: "
                        f"expected EXECUTE={expected}, got {actual}"
                    )
    return failures


SET_ROLE_UNAVAILABLE = False


def _probe(conn, role: str, sql: str, expect_denied: bool) -> str | None:
    """Run `sql` under SET LOCAL ROLE <role>; return failure message or None.

    Skips silently when the DB connection role lacks permission to SET ROLE
    (e.g. Supabase transaction pooler). Static privilege checks still run.
    """
    global SET_ROLE_UNAVAILABLE
    if SET_ROLE_UNAVAILABLE:
        return None
    with conn.cursor() as cur:
        try:
            cur.execute("BEGIN")
            cur.execute(f"SET LOCAL ROLE {role}")
        except Exception as e:  # noqa: BLE001
            conn.rollback()
            if "permission denied to set role" in str(e).lower():
                SET_ROLE_UNAVAILABLE = True
                return None
            raise
        try:
            cur.execute(sql)
            conn.rollback()
            if expect_denied:
                return f"[{role}] `{sql}` succeeded but should be denied"
            return None
        except psycopg2.errors.InsufficientPrivilege as e:
            conn.rollback()
            if not expect_denied:
                return f"[{role}] `{sql}` denied but should be allowed: {e}"
            return None
        except Exception as e:  # noqa: BLE001
            conn.rollback()
            msg = str(e).lower()
            if "permission denied" in msg:
                if not expect_denied:
                    return f"[{role}] `{sql}` → {e}"
                return None
            # Function ran (definer-body error, missing session ctx, etc.)
            # — EXECUTE succeeded, which is what we care about here.
            if expect_denied:
                return f"[{role}] `{sql}` ran despite REVOKE, threw: {e}"
            return None


def check_runtime(conn) -> list[str]:
    """Runtime probes matching the two real call sites."""
    failures: list[str] = []

    # 1) Patient RLS path — authenticated must be able to CALL the helper.
    #    Returns bool (false for a random phone); we only assert EXECUTE.
    err = _probe(
        conn,
        "authenticated",
        "SELECT public._appointment_belongs_to_me('0500000000')",
        expect_denied=False,
    )
    if err:
        failures.append(err)

    # anon must be denied (function is SECURITY DEFINER but internal).
    err = _probe(
        conn,
        "anon",
        "SELECT public._appointment_belongs_to_me('0500000000')",
        expect_denied=True,
    )
    if err:
        failures.append(err)

    # 2) Auth-event logging — anon MUST be able to log a failed login before
    #    a session exists. Use a synthetic action to avoid polluting metrics.
    log_call = (
        "SELECT public.log_auth_event("
        "'login_failed'::text, NULL::uuid, "
        "'regression+anon@example.invalid'::text, "
        "'127.0.0.1'::text, 'regression-suite'::text, "
        "jsonb_build_object('probe', true))"
    )
    err = _probe(conn, "anon", log_call, expect_denied=False)
    if err:
        failures.append(err)
    err = _probe(conn, "authenticated", log_call, expect_denied=False)
    if err:
        failures.append(err)

    return failures


def main() -> int:
    for v in ("PGHOST", "PGUSER", "PGPASSWORD", "PGDATABASE"):
        if not os.environ.get(v):
            print(f"MISSING env {v}", file=sys.stderr)
            return 2

    conn = connect()
    try:
        static = check_static(conn)
        runtime = check_runtime(conn)
        total = len(static) + len(runtime)

        print(f"── Static privilege checks: {len(static)} issue(s)")
        for f in static:
            print(f"    {f}")
        print(f"── Runtime SET LOCAL ROLE probes: {len(runtime)} issue(s)")
        for f in runtime:
            print(f"    {f}")

        if total == 0:
            print("\n✅ Execute-privilege regression suite clean.")
            return 0
        print(f"\n❌ {total} regression(s) detected.")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
