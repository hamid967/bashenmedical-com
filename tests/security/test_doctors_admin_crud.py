"""
Regression tests for admin-panel doctor management authorization.

Two layers are enforced together:

  1. Table-level ACL on public.doctors:
       - authenticated / anon / service_role must hold the standard grants
         (Data API cannot reach the table without them).
  2. RLS policies on public.doctors:
       - "read active doctors"  → SELECT for anon+authenticated where
         is_active=true (OR admin).
       - "admins manage doctors" → ALL for authenticated gated by
         public.has_role(auth.uid(), 'admin').

Runtime probes via SET LOCAL ROLE reproduce the two real call sites we
want to protect against future regressions:
  - anon / non-admin authenticated may READ active doctors.
  - anon / non-admin authenticated MUST be denied INSERT/UPDATE/DELETE.

Exit 0 = clean. Non-zero = at least one violation.
"""
from __future__ import annotations

import os
import sys
import psycopg2


REQUIRED_POLICIES: list[tuple[str, str]] = [
    # (policy_name, polcmd) — polcmd: r=SELECT, *=ALL
    ("admins manage doctors", "*"),
    ("read active doctors", "r"),
]

# Roles → set of expected privileges on public.doctors.
REQUIRED_GRANTS: dict[str, set[str]] = {
    "authenticated": {"SELECT", "INSERT", "UPDATE", "DELETE"},
    "anon": {"SELECT"},
    "service_role": {"SELECT", "INSERT", "UPDATE", "DELETE"},
}


def connect() -> "psycopg2.extensions.connection":
    return psycopg2.connect(
        host=os.environ["PGHOST"],
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ["PGUSER"],
        password=os.environ["PGPASSWORD"],
        dbname=os.environ["PGDATABASE"],
    )


def check_static(conn) -> list[str]:
    failures: list[str] = []
    with conn.cursor() as cur:
        # RLS must be ON.
        cur.execute(
            "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.doctors'::regclass"
        )
        if not cur.fetchone()[0]:
            failures.append("[static] RLS is disabled on public.doctors")

        # Required policies exist.
        cur.execute(
            """
            SELECT polname, polcmd
              FROM pg_policy
             WHERE polrelid = 'public.doctors'::regclass
            """
        )
        present = {row[0]: row[1] for row in cur.fetchall()}
        for name, expected_cmd in REQUIRED_POLICIES:
            actual = present.get(name)
            if actual is None:
                failures.append(f"[static] missing RLS policy on doctors: {name!r}")
            elif actual != expected_cmd:
                failures.append(
                    f"[static] policy {name!r} on doctors: expected cmd={expected_cmd!r}, got {actual!r}"
                )

        # Table-level grants for the Data API roles.
        for role, privs in REQUIRED_GRANTS.items():
            for priv in privs:
                cur.execute(
                    "SELECT has_table_privilege(%s, 'public.doctors', %s)",
                    (role, priv),
                )
                if not cur.fetchone()[0]:
                    failures.append(
                        f"[static] public.doctors missing GRANT {priv} to {role}"
                    )
    return failures


SET_ROLE_UNAVAILABLE = False


def _probe(conn, role: str, sql: str, expect_denied: bool) -> str | None:
    """SET LOCAL ROLE then run sql; return failure message or None."""
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
                return f"[{role}] `{sql}` succeeded but should be denied by RLS"
            return None
        except psycopg2.errors.InsufficientPrivilege as e:
            conn.rollback()
            if not expect_denied:
                return f"[{role}] `{sql}` denied but should be allowed: {e}"
            return None
        except Exception as e:  # noqa: BLE001
            conn.rollback()
            msg = str(e).lower()
            # RLS violations surface as 42501 permission denied OR
            # "new row violates row-level security policy" (23514/42501).
            if (
                "permission denied" in msg
                or "row-level security" in msg
                or "violates row-level security" in msg
            ):
                if not expect_denied:
                    return f"[{role}] `{sql}` → {e}"
                return None
            if expect_denied:
                return f"[{role}] `{sql}` ran without RLS denial, threw: {e}"
            return None


def check_runtime(conn) -> list[str]:
    failures: list[str] = []

    # Non-mutating SELECT: anon must be able to read active doctors.
    err = _probe(
        conn,
        "anon",
        "SELECT id FROM public.doctors WHERE is_active = true LIMIT 1",
        expect_denied=False,
    )
    if err:
        failures.append(err)

    # authenticated (no admin JWT claim) must also read active doctors.
    err = _probe(
        conn,
        "authenticated",
        "SELECT id FROM public.doctors WHERE is_active = true LIMIT 1",
        expect_denied=False,
    )
    if err:
        failures.append(err)

    # Writes must be denied for non-admin authenticated (auth.uid() is NULL
    # under SET LOCAL ROLE, so has_role(...) evaluates to false → policy
    # rejects). Wrap each mutation in a transaction that rolls back.
    write_probes = [
        (
            "authenticated",
            "INSERT INTO public.doctors (name_ar, name_en) "
            "VALUES ('regression-doc', 'regression-doc')",
        ),
        (
            "authenticated",
            "UPDATE public.doctors SET name_en = 'hijacked' "
            "WHERE id IN (SELECT id FROM public.doctors LIMIT 1)",
        ),
        (
            "authenticated",
            "DELETE FROM public.doctors "
            "WHERE id IN (SELECT id FROM public.doctors LIMIT 1)",
        ),
        (
            "anon",
            "INSERT INTO public.doctors (name_ar, name_en) "
            "VALUES ('regression-anon', 'regression-anon')",
        ),
        (
            "anon",
            "UPDATE public.doctors SET name_en = 'hijacked-anon' "
            "WHERE id IN (SELECT id FROM public.doctors LIMIT 1)",
        ),
        (
            "anon",
            "DELETE FROM public.doctors "
            "WHERE id IN (SELECT id FROM public.doctors LIMIT 1)",
        ),
    ]
    for role, sql in write_probes:
        err = _probe(conn, role, sql, expect_denied=True)
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

        print(f"── Static ACL/RLS checks: {len(static)} issue(s)")
        for f in static:
            print(f"    {f}")
        if SET_ROLE_UNAVAILABLE:
            print("── Runtime SET LOCAL ROLE probes: skipped (pooler role cannot SET ROLE)")
        else:
            print(f"── Runtime SET LOCAL ROLE probes: {len(runtime)} issue(s)")
            for f in runtime:
                print(f"    {f}")

        if total == 0:
            print("\n✅ Doctors admin CRUD authorization suite clean.")
            return 0
        print(f"\n❌ {total} regression(s) detected.")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
