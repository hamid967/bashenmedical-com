"""
CI preflight — قبل اختبار portal-cancel E2E.

يتحقق من:
  - وجود E2E admin في auth.users ودوره 'admin' في user_roles.
  - profiles.phone قابل للتحديث (PATCH → read → restore).
  - appointments RW: insert → PATCH status='cancelled' + cancelled_at → delete.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, E2E_ADMIN_EMAIL
"""
from __future__ import annotations

import json
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _verify_common import SupaClient, find_admin_user_id, run  # noqa: E402

TAG = "verify-cancel"
HINT = ("راجع scripts/ci/ensure-e2e-admin.py وسياسات RLS "
        "لجدولَي profiles و appointments.")

E2E_PHONE = "0555088624"

cli, env = SupaClient.from_env(TAG, extra_required=["E2E_ADMIN_EMAIL"], fail_hint=HINT)
ADMIN_EMAIL = env["E2E_ADMIN_EMAIL"].lower()


def main() -> None:
    # 1) admin user + role
    uid = find_admin_user_id(cli, ADMIN_EMAIL)
    role_rows = cli.rows(
        cli.get("/rest/v1/user_roles", {
            "user_id": f"eq.{uid}",
            "role": "eq.admin",
            "select": "user_id,role",
        }),
        "user_roles admin",
    )
    if not role_rows:
        cli.fail(f"المستخدم {ADMIN_EMAIL} لا يملك دور admin في user_roles.")

    # 2) profiles.phone round-trip
    profile_rows = cli.rows(
        cli.get("/rest/v1/profiles", {"id": f"eq.{uid}", "select": "id,phone"}),
        "read profile",
    )
    original_phone = profile_rows[0].get("phone") if profile_rows else None
    profile_exists = bool(profile_rows)

    if profile_exists:
        res = cli.patch(f"/rest/v1/profiles?id=eq.{uid}", {"phone": E2E_PHONE})
        if res[0] >= 300:
            cli.fail(f"PATCH profiles.phone: HTTP {res[0]} — {res[1][:300]}")
    else:
        res = cli.post(
            "/rest/v1/profiles",
            {"id": uid, "phone": E2E_PHONE},
            prefer="return=representation,resolution=merge-duplicates",
        )
        if res[0] >= 300:
            cli.fail(f"POST profiles: HTTP {res[0]} — {res[1][:300]}")

    if profile_exists and original_phone is not None and original_phone != E2E_PHONE:
        cli.request(
            f"/rest/v1/profiles?id=eq.{uid}",
            "PATCH",
            body={"phone": original_phone},
            extra_headers={"Prefer": "return=minimal"},
        )

    # 3) appointments RW + cancel round-trip
    future = (date.today() + timedelta(days=30)).isoformat()
    unique_reason = f"E2E_CANCEL_PREFLIGHT_{int(time.time())}"
    ins = cli.post("/rest/v1/appointments", {
        "appointment_date": future,
        "appointment_time": "10:00:00",
        "status": "new",
        "reason": unique_reason,
        "patient_name": "preflight cancel",
        "patient_phone": E2E_PHONE,
        "is_demo": True,
    })
    if ins[0] >= 300:
        cli.fail(f"insert appointment: HTTP {ins[0]} — {ins[1][:400]}")
    rows = json.loads(ins[1] or "[]")
    if not rows:
        cli.fail("insert appointment: لم يُعَد أي صف.")
    appt_id = rows[0]["id"]

    try:
        upd = cli.patch(
            f"/rest/v1/appointments?id=eq.{appt_id}",
            {"status": "cancelled",
             "cancelled_at": datetime.now(timezone.utc).isoformat()},
        )
        if upd[0] >= 300:
            cli.fail(f"PATCH appointment cancelled: HTTP {upd[0]} — {upd[1][:300]}")
        upd_rows = json.loads(upd[1] or "[]")
        if (not upd_rows or upd_rows[0].get("status") != "cancelled"
                or not upd_rows[0].get("cancelled_at")):
            cli.fail(f"read-back cancelled غير مطابق: {upd_rows!r}")
    finally:
        cli.delete(f"/rest/v1/appointments?id=eq.{appt_id}")

    cli.ok(
        f"admin={ADMIN_EMAIL} role=admin profiles.phone RW ✓ "
        f"appointments insert/cancel/delete ✓"
    )


if __name__ == "__main__":
    run(main, cli)
