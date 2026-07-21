"""
CI preflight — قبل اختبار waitlist offer confirm E2E.

يتحقق من:
  - fixtures الحجز (branch + doctor + doctor_branches).
  - slot_holds RW round-trip (SERVICE_ROLE).
  - appointment_waitlist RW بحالة 'notified' مربوطة بـ hold صالح.
  - soft: وجود availability_slot لتاريخ/وقت العرض (+10d, 09:00:00).

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
Optional: E2E_BRANCH_SLUG (e2e-branch), E2E_DOCTOR_SLUG (e2e-doctor)
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _verify_common import SupaClient, get_e2e_bundle, run  # noqa: E402

TAG = "verify-waitlist"
HINT = ("راجع scripts/ci/ensure-e2e-booking-fixtures.py و RLS "
        "لجدولَي slot_holds و appointment_waitlist.")

BRANCH_SLUG = os.environ.get("E2E_BRANCH_SLUG", "e2e-branch")
DOC_SLUG = os.environ.get("E2E_DOCTOR_SLUG", "e2e-doctor")

OFFER_DATE = (date.today() + timedelta(days=10)).isoformat()
OFFER_TIME = "09:00:00"

cli, _ = SupaClient.from_env(TAG, fail_hint=HINT)


def main() -> None:
    branch, _spec, doctor = get_e2e_bundle(
        cli, branch_slug=BRANCH_SLUG, doctor_slug=DOC_SLUG
    )

    # 1) slot_holds RW round-trip
    expires = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    hold = cli.first(
        cli.post("/rest/v1/slot_holds", {
            "doctor_id": doctor["id"],
            "branch_id": branch["id"],
            "appointment_date": OFFER_DATE,
            "appointment_time": OFFER_TIME,
            "session_id": f"wl-preflight:{int(time.time())}",
            "expires_at": expires,
        }),
        "insert slot_hold (preflight)",
    )
    hold_id = hold["id"]

    # 2) appointment_waitlist notified
    wl_res = cli.post("/rest/v1/appointment_waitlist", {
        "reference": "PENDING",
        "patient_name": f"E2E_WL_PREFLIGHT_{int(time.time())}",
        "patient_phone": f"055500{int(time.time()) % 10000:04d}",
        "doctor_id": doctor["id"],
        "branch_id": branch["id"],
        "specialty_id": doctor.get("specialty_id"),
        "preferred_from": OFFER_DATE,
        "preferred_to": OFFER_DATE,
        "status": "notified",
        "notified_at": datetime.now(timezone.utc).isoformat(),
        "offered_date": OFFER_DATE,
        "offered_time": OFFER_TIME,
        "offered_hold_id": hold_id,
        "offered_expires_at": expires,
    })
    if wl_res[0] >= 300:
        cli.delete(f"/rest/v1/slot_holds?id=eq.{hold_id}")
        cli.fail(f"insert appointment_waitlist: HTTP {wl_res[0]} — {wl_res[1][:300]}")
    wl_id = json.loads(wl_res[1])[0]["id"]

    # 3) read-back
    row = cli.rows(
        cli.get(
            "/rest/v1/appointment_waitlist",
            {"id": f"eq.{wl_id}",
             "select": "id,status,offered_hold_id,offered_expires_at"},
        ),
        "read-back waitlist",
    )
    ok = (row and row[0].get("status") == "notified"
          and row[0].get("offered_hold_id") == hold_id)
    cli.delete(f"/rest/v1/appointment_waitlist?id=eq.{wl_id}")
    cli.delete(f"/rest/v1/slot_holds?id=eq.{hold_id}")
    if not ok:
        cli.fail(f"read-back waitlist غير مطابق: {row!r}")

    # 4) soft check — availability_slot
    slot_note = "غير موجود (soft — الاختبار لا يعتمده)"
    slots = cli.rows(
        cli.get("/rest/v1/availability_slots", {
            "doctor_id": f"eq.{doctor['id']}",
            "slot_date": f"eq.{OFFER_DATE}",
            "start_time": f"eq.{OFFER_TIME}",
            "select": "id,status",
            "limit": "1",
        }),
        "availability_slots (soft)",
    )
    if slots:
        slot_note = f"موجود status={slots[0].get('status')}"

    cli.ok(
        f"branch={branch['name_ar']!r} doctor={doctor['name_ar']!r} "
        f"slot_holds RW ✓ appointment_waitlist RW ✓ "
        f"slot@{OFFER_DATE} {OFFER_TIME}: {slot_note}"
    )


if __name__ == "__main__":
    run(main, cli)
