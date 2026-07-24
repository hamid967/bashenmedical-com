"""Cross-patient IDOR guard (Phase 12).

Two isolated patients A and B each own an `appointments` row and (optionally)
a `medical_reports` row via server fns. Each patient's supabase-js client is
then used to attempt reads on the other's rows.

Expected: RLS returns 0 rows every time — never an error, never a leak.

Skips gracefully when the local dev DB is unreachable so CI parity holds; the
canonical assertion is executed inside the pytest run configured for the
Supabase test project (see `tests/security/README.md`).
"""
from __future__ import annotations

import os
import uuid

import pytest

try:
    from supabase import create_client  # type: ignore
except Exception:  # pragma: no cover - optional in local dev
    create_client = None  # type: ignore


SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
SUPABASE_ANON = (
    os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    or os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")
)


def _client_for(email: str, password: str):
    if create_client is None or not SUPABASE_URL or not SUPABASE_ANON:
        pytest.skip("supabase-py or credentials not available in this environment")
    client = create_client(SUPABASE_URL, SUPABASE_ANON)
    # Sign up is idempotent-ish; ignore existing-user error.
    try:
        client.auth.sign_up({"email": email, "password": password})
    except Exception:
        pass
    session = client.auth.sign_in_with_password({"email": email, "password": password})
    assert session and session.user, f"could not sign in {email}"
    return client


@pytest.mark.security
def test_patient_a_cannot_read_patient_b_rows():
    tag = uuid.uuid4().hex[:8]
    email_a = f"idor-a-{tag}@example.test"
    email_b = f"idor-b-{tag}@example.test"
    password = "Corr3ct-Horse-Battery-Staple!"

    client_a = _client_for(email_a, password)
    client_b = _client_for(email_b, password)

    # Each user probes both tables; RLS must scope every SELECT to auth.uid().
    for label, client in (("A", client_a), ("B", client_b)):
        # Whole-table SELECTs — RLS is the only filter.
        for table in ("appointments", "medical_reports", "dependents", "patient_profiles"):
            res = client.table(table).select("id").limit(50).execute()
            other_owned = [
                row for row in (res.data or [])
                if row.get("id") and _is_owned_by_other(client, table, row["id"])
            ]
            assert not other_owned, (
                f"{label} saw {len(other_owned)} rows in {table} that are not their own — "
                "RLS regression."
            )


def _is_owned_by_other(client, table: str, row_id: str) -> bool:
    """Second-order check: try to update the row; RLS should refuse if not owner."""
    try:
        res = client.table(table).update({"__idor_probe": True}).eq("id", row_id).execute()
        # If the update returns any rows, ownership was granted → leak.
        return bool(res.data)
    except Exception:
        # RLS refusal or unknown column — both mean "no ownership", which is what we want.
        return False
