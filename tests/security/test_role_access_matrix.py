"""
Role access matrix — verify EXECUTE privilege scoping per role.

Complements `test_secdef_privileges.py` (which asserts no leaks to anon/PUBLIC).
This suite asserts the positive side of the contract:

  1. Every function in PUBLIC_READ_ALLOWLIST is executable by BOTH `anon`
     AND `authenticated` (drift check — allowlisted = public catalog/OTP path).
  2. Every non-allowlisted, non-internal SECURITY DEFINER function
     that is executable by `authenticated` is NOT executable by `anon`.
     (Auth-gated staff/user RPCs must never leak to guests.)
  3. Runtime probe: `SET LOCAL ROLE authenticated` can invoke a sample of
     allowlisted read-only functions without `permission denied`.
  4. Runtime probe: `SET LOCAL ROLE anon` is denied on a sample of
     auth-only functions (regression guard for Batch A2 REVOKEs).

Exit 0 = clean. Non-zero = at least one violation.
"""
from __future__ import annotations

import os
import sys
import psycopg2
import psycopg2.extras

# Reuse the canonical allowlist so the two files never drift.
from test_secdef_privileges import PUBLIC_READ_ALLOWLIST, connect, fetch_secdef


# Read-only allowlist functions safe to invoke at runtime with no args
# (or trivially-null args). Signature drift here means update this list.
AUTHENTICATED_READ_PROBES: list[tuple[str, str]] = [
    ("get_my_doctor_id", "()"),
    ("list_public_branches", "()"),
    ("list_public_doctors", "()"),
    ("specialty_doctor_counts", "()"),
]

# Auth-gated functions that must reject anon at runtime.
# Kept small — the static check in Rule 2 covers the full surface.
ANON_DENIED_PROBES: list[tuple[str, str]] = [
    ("_guard_profile_verified_phone", "()"),
]


def check_allowlist_has_authenticated(rows: list[dict]) -> list[str]:
    """Rule 1: allowlisted functions must be callable by BOTH anon AND authenticated."""
    bad = []
    by_name: dict[str, list[dict]] = {}
    for r in rows:
        by_name.setdefault(r["name"], []).append(r)
    for name in PUBLIC_READ_ALLOWLIST:
        variants = by_name.get(name)
        if not variants:
            bad.append(f"[allowlist-missing] {name} is in allowlist but not found as SECDEF in DB")
            continue
        # Every overload of an allowlisted name must be reachable by both roles.
        for r in variants:
            if not r["anon_exec"]:
                bad.append(f"[allowlist-anon-blocked] {name}({r['args']}) — allowlisted but anon cannot EXECUTE")
            if not r["auth_exec"]:
                bad.append(f"[allowlist-auth-blocked] {name}({r['args']}) — allowlisted but authenticated cannot EXECUTE")
    return bad


def check_auth_only_never_leaks_to_anon(rows: list[dict]) -> list[str]:
    """Rule 2: any function callable by authenticated and NOT allowlisted must NOT be callable by anon."""
    bad = []
    for r in rows:
        name = r["name"]
        if name.startswith("_"):
            continue  # internal: handled by test_secdef_privileges
        if name in PUBLIC_READ_ALLOWLIST:
            continue  # explicit public catalog/OTP surface
        if r["auth_exec"] and r["anon_exec"]:
            bad.append(f"[auth-leaked-to-anon] {name}({r['args']}) — authenticated-only fn is also callable by anon")
    return bad


def probe_role(conn, role: str, probes: list[tuple[str, str]], expect_allowed: bool) -> list[str]:
    """SET LOCAL ROLE <role> and try each probe. expect_allowed flips the assertion."""
    failures: list[str] = []
    for fn, args in probes:
        with conn.cursor() as cur:
            try:
                cur.execute("BEGIN")
                cur.execute(f"SET LOCAL ROLE {role}")
                cur.execute(f"SELECT public.{fn}{args}")
                # EXECUTE succeeded.
                if not expect_allowed:
                    failures.append(f"[{role}-should-be-denied] {fn}{args} succeeded")
                conn.rollback()
            except psycopg2.errors.InsufficientPrivilege:
                conn.rollback()
                if expect_allowed:
                    failures.append(f"[{role}-blocked] {fn}{args} → permission denied (should be allowed)")
            except Exception as e:
                conn.rollback()
                msg = str(e).lower()
                if "does not exist" in msg or "no function matches" in msg:
                    failures.append(f"[signature-drift:{role}] {fn}{args}: {e}")
                elif "permission denied" in msg:
                    if expect_allowed:
                        failures.append(f"[{role}-blocked] {fn}{args} → {e}")
                else:
                    # Function ran but threw internally (e.g. missing session ctx).
                    # That still proves EXECUTE succeeded.
                    if not expect_allowed:
                        failures.append(f"[{role}-executed] {fn}{args} ran despite REVOKE, threw: {e}")
                    # If allowed, an internal error is acceptable — EXECUTE worked.
    return failures


def main() -> int:
    for v in ("PGHOST", "PGUSER", "PGPASSWORD", "PGDATABASE"):
        if not os.environ.get(v):
            print(f"MISSING env {v}", file=sys.stderr)
            return 2

    conn = connect()
    try:
        rows = fetch_secdef(conn)
        print(f"Scanned {len(rows)} SECURITY DEFINER functions.\n")

        allowlist_gap = check_allowlist_has_authenticated(rows)
        auth_leaks = check_auth_only_never_leaks_to_anon(rows)
        auth_probes = probe_role(conn, "authenticated", AUTHENTICATED_READ_PROBES, expect_allowed=True)
        anon_probes = probe_role(conn, "anon", ANON_DENIED_PROBES, expect_allowed=False)

        sections = [
            ("Allowlist missing authenticated/anon EXECUTE", allowlist_gap),
            ("Auth-only fn leaked to anon (static)", auth_leaks),
            ("Runtime probe: authenticated should ALLOW", auth_probes),
            ("Runtime probe: anon should DENY", anon_probes),
        ]
        total = 0
        for title, items in sections:
            print(f"── {title}: {len(items)} issue(s)")
            for i in items:
                print(f"    {i}")
            total += len(items)
            print()

        if total == 0:
            print("✅ Role access matrix clean.")
            return 0
        print(f"❌ {total} role-scope violation(s) detected.")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
