"""
CI preflight: يتحقق قبل تشغيل اختبار waitlist أن:
  - fixtures الحجز E2E (branch/specialty/doctor) موجودة ومربوطة.
  - كتابة/قراءة/حذف slot_holds تعمل عبر SERVICE_ROLE (اتصال حي فعلي).
  - كتابة/قراءة/حذف appointment_waitlist بحالة 'notified' مربوطة بـ
    fixtures + slot_hold صالح (offered_hold_id/offered_expires_at) تعمل.
  - وجود availability_slot متاح لتاريخ/وقت العرض المستخدم في الاختبار
    (يوم +10, 09:00:00) — soft warning إن غاب (لأن الاختبار لا يعتمده).

يفشل مبكراً بالخطوة الأولى الفاشلة برسالة عربية واضحة.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
Optional: E2E_BRANCH_SLUG (e2e-branch), E2E_DOCTOR_SLUG (e2e-doctor)
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
_missing = [k for k in REQUIRED if not os.environ.get(k, "").strip()]
if _missing:
    print(f"[verify][waitlist] متغيّرات مفقودة: {', '.join(_missing)}", file=sys.stderr)
    sys.exit(1)

SUPA = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip()

BRANCH_SLUG = os.environ.get("E2E_BRANCH_SLUG", "e2e-branch")
DOCTOR_SLUG = os.environ.get("E2E_DOCTOR_SLUG", "e2e-doctor")

OFFER_DATE = (date.today() + timedelta(days=10)).isoformat()
OFFER_TIME = "09:00:00"


def req(path: str, method: str = "GET", body=None,
        extra: dict | None = None) -> tuple[int, str]:
    url = f"{SUPA}{path}"
    headers = {
        "apikey": KEY,
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if extra:
        headers.update(extra)
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            return resp.status, resp.read().decode() or ""
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="ignore")


def fail(msg: str) -> None:
    print(f"[verify][waitlist][FAIL] {msg}", file=sys.stderr)
    print("→ راجع scripts/ci/ensure-e2e-booking-fixtures.py و RLS "
          "لجدولَي slot_holds و appointment_waitlist.", file=sys.stderr)
    sys.exit(1)


def first(status: int, body: str, label: str) -> dict:
    if status >= 300:
        fail(f"{label}: HTTP {status} — {body[:300]}")
    rows = json.loads(body or "[]")
    if not rows:
        fail(f"{label}: لا صفوف عائدة")
    return rows[0]


def main() -> None:
    # 1) fixtures
    q = urllib.parse.urlencode({"slug": f"eq.{BRANCH_SLUG}", "select": "id,name_ar"})
    branch = first(*req(f"/rest/v1/branches?{q}"), "branch fixture")
    q = urllib.parse.urlencode({"slug": f"eq.{DOCTOR_SLUG}",
                                "select": "id,name_ar,specialty_id,branch_id"})
    doctor = first(*req(f"/rest/v1/doctors?{q}"), "doctor fixture")

    q = urllib.parse.urlencode({
        "doctor_id": f"eq.{doctor['id']}",
        "branch_id": f"eq.{branch['id']}",
        "select": "doctor_id,branch_id",
    })
    links = req(f"/rest/v1/doctor_branches?{q}")
    if links[0] >= 300 or not json.loads(links[1] or "[]"):
        fail("doctor_branches: لا يوجد ربط بين طبيب E2E وفرع E2E.")

    # 2) slot_holds RW round-trip
    expires = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    hold_payload = {
        "doctor_id": doctor["id"],
        "branch_id": branch["id"],
        "appointment_date": OFFER_DATE,
        "appointment_time": OFFER_TIME,
        "session_id": f"wl-preflight:{int(time.time())}",
        "expires_at": expires,
    }
    st, body = req("/rest/v1/slot_holds", method="POST", body=hold_payload,
                   extra={"Prefer": "return=representation"})
    hold = first(st, body, "insert slot_hold (preflight)")
    hold_id = hold["id"]

    # 3) appointment_waitlist notified + ربط بـ hold
    wl_payload = {
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
    }
    st, body = req("/rest/v1/appointment_waitlist", method="POST", body=wl_payload,
                   extra={"Prefer": "return=representation"})
    if st >= 300:
        # cleanup hold before failing
        req(f"/rest/v1/slot_holds?id=eq.{hold_id}", method="DELETE")
        fail(f"insert appointment_waitlist: HTTP {st} — {body[:300]}")
    wl = json.loads(body or "[]")[0]
    wl_id = wl["id"]

    # 4) read-back
    st, body = req(f"/rest/v1/appointment_waitlist?id=eq.{wl_id}"
                   "&select=id,status,offered_hold_id,offered_expires_at")
    row = json.loads(body or "[]")
    if not row or row[0].get("status") != "notified" or row[0].get("offered_hold_id") != hold_id:
        req(f"/rest/v1/appointment_waitlist?id=eq.{wl_id}", method="DELETE")
        req(f"/rest/v1/slot_holds?id=eq.{hold_id}", method="DELETE")
        fail(f"read-back waitlist غير مطابق: {row!r}")

    # 5) cleanup preflight rows
    req(f"/rest/v1/appointment_waitlist?id=eq.{wl_id}", method="DELETE")
    req(f"/rest/v1/slot_holds?id=eq.{hold_id}", method="DELETE")

    # 6) soft: availability_slot لتاريخ/وقت العرض
    q = urllib.parse.urlencode({
        "doctor_id": f"eq.{doctor['id']}",
        "slot_date": f"eq.{OFFER_DATE}",
        "start_time": f"eq.{OFFER_TIME}",
        "select": "id,status",
        "limit": "1",
    })
    st, body = req(f"/rest/v1/availability_slots?{q}")
    slot_note = "غير موجود (soft — الاختبار لا يعتمده)"
    if st < 300:
        rows = json.loads(body or "[]")
        if rows:
            slot_note = f"موجود status={rows[0].get('status')}"

    print(f"[verify][waitlist] OK — branch={branch['name_ar']!r} "
          f"doctor={doctor['name_ar']!r} slot_holds RW ✓ "
          f"appointment_waitlist RW ✓ slot@{OFFER_DATE} {OFFER_TIME}: {slot_note}")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        fail(f"exception: {e}")
