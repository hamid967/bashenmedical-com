"""
CI preflight — قبل اختبار E2E لإعادة الجدولة (portal_reschedule_appointment).

يتحقق أن:
  1) fixtures الحجز (branch/specialty/doctor + doctor_branches) موجودة —
     (تُعاد نفس فحوصات verify-e2e-booking-fixtures باختصار).
  2) توجد slot صالحة (status='available') للطبيب E2E في نافذة إعادة الجدولة
     (افتراضياً +30..+60 يوم من اليوم) وعلى الأقل واحدة عند وقت الهدف
     (افتراضياً 14:30) — وهو التاريخ/الوقت الذي يستخدمه الاختبار.
  3) مستخدم E2E admin (E2E_ADMIN_EMAIL) موجود في auth.users.

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (مطلوبان)
  E2E_ADMIN_EMAIL                            (مطلوب)

اختياري:
  E2E_BRANCH_SLUG        default 'e2e-branch'
  E2E_SPECIALTY_SLUG     default 'e2e-specialty'
  E2E_DOCTOR_SLUG        default 'e2e-doctor'
  E2E_RESCHED_DAYS_MIN   default 30
  E2E_RESCHED_DAYS_MAX   default 60
  E2E_RESCHED_TARGET_TIME default '14:30'   (HH:MM — يطابق NEW_TIME_UI)

Exit: 0 pass, 1 fail.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "E2E_ADMIN_EMAIL"]
_missing = [k for k in REQUIRED if not os.environ.get(k, "").strip()]
if _missing:
    print(f"[verify-resched] متغيّرات مفقودة: {', '.join(_missing)}", file=sys.stderr)
    sys.exit(1)

SUPA_URL = os.environ["SUPABASE_URL"].rstrip("/")
SRV_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip()
ADMIN_EMAIL = os.environ["E2E_ADMIN_EMAIL"].strip()

BRANCH_SLUG = os.environ.get("E2E_BRANCH_SLUG", "e2e-branch")
SPEC_SLUG = os.environ.get("E2E_SPECIALTY_SLUG", "e2e-specialty")
DOC_SLUG = os.environ.get("E2E_DOCTOR_SLUG", "e2e-doctor")
DAYS_MIN = int(os.environ.get("E2E_RESCHED_DAYS_MIN", "30"))
DAYS_MAX = int(os.environ.get("E2E_RESCHED_DAYS_MAX", "60"))
TARGET_TIME = os.environ.get("E2E_RESCHED_TARGET_TIME", "14:30").strip()

if not (0 <= DAYS_MIN < DAYS_MAX):
    print(
        f"[verify-resched] نافذة زمنية غير صالحة: {DAYS_MIN}..{DAYS_MAX}",
        file=sys.stderr,
    )
    sys.exit(1)


def _req(path: str, params: dict[str, str] | None = None) -> list[dict]:
    url = f"{SUPA_URL}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        method="GET",
        headers={
            "apikey": SRV_KEY,
            "Authorization": f"Bearer {SRV_KEY}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode() or "[]")


def fail(msg: str) -> None:
    print(f"[verify-resched][FAIL] {msg}", file=sys.stderr)
    print(
        "→ تلميح: شغّل scripts/ci/ensure-e2e-booking-fixtures.py "
        "و scripts/ci/ensure-e2e-admin.py ثم أعد المحاولة.",
        file=sys.stderr,
    )
    sys.exit(1)


def main() -> None:
    # 1) fixtures
    branches = _req("/rest/v1/branches", {"select": "id,slug,name_ar", "slug": f"eq.{BRANCH_SLUG}"})
    if not branches:
        fail(f"الفرع '{BRANCH_SLUG}' غير موجود.")
    branch = branches[0]

    specs = _req("/rest/v1/specialties", {"select": "id,slug", "slug": f"eq.{SPEC_SLUG}"})
    if not specs:
        fail(f"التخصص '{SPEC_SLUG}' غير موجود.")
    spec = specs[0]

    doctors = _req(
        "/rest/v1/doctors",
        {"select": "id,slug,name_ar,specialty_id", "slug": f"eq.{DOC_SLUG}"},
    )
    if not doctors:
        fail(f"الطبيب '{DOC_SLUG}' غير موجود.")
    doc = doctors[0]
    if doc.get("specialty_id") != spec["id"]:
        fail(f"الطبيب غير مرتبط بالتخصص المطلوب (got {doc.get('specialty_id')}).")

    links = _req(
        "/rest/v1/doctor_branches",
        {
            "select": "doctor_id,branch_id",
            "doctor_id": f"eq.{doc['id']}",
            "branch_id": f"eq.{branch['id']}",
        },
    )
    if not links:
        fail("doctor_branches: لا يوجد ربط للطبيب E2E بالفرع E2E.")

    # 2) نافذة إعادة الجدولة — سلوتات متاحة
    lo = (date.today() + timedelta(days=DAYS_MIN)).isoformat()
    hi = (date.today() + timedelta(days=DAYS_MAX)).isoformat()
    slots = _req(
        "/rest/v1/availability_slots",
        {
            "select": "slot_date,start_time,status",
            "doctor_id": f"eq.{doc['id']}",
            "status": "eq.available",
            "and": f"(slot_date.gte.{lo},slot_date.lte.{hi})",
            "limit": "500",
        },
    )
    if not slots:
        fail(
            f"لا توجد أي slot متاحة للطبيب E2E في نافذة "
            f"إعادة الجدولة ({lo} .. {hi})."
        )

    # target time — يطابق ما يُدخله UI في المودال
    tgt_hhmm = TARGET_TIME if len(TARGET_TIME) == 5 else TARGET_TIME[:5]
    matches = [
        s for s in slots
        if str(s.get("start_time", ""))[:5] == tgt_hhmm
    ]
    if not matches:
        sample_times = sorted({str(s["start_time"])[:5] for s in slots})[:10]
        fail(
            f"لا توجد slot متاحة عند الوقت الهدف {tgt_hhmm} في النافذة "
            f"({lo} .. {hi}). أمثلة على الأوقات المتاحة: {sample_times}"
        )

    # 3) admin user موجود
    q = urllib.parse.urlencode({"email": ADMIN_EMAIL})
    try:
        users = _req(f"/auth/v1/admin/users", {"email": ADMIN_EMAIL})
        # /auth/v1/admin/users returns {users: [...]} not a bare list
    except urllib.error.HTTPError:
        users = None
    # fallback: fetch and parse dict shape
    if users is None or (isinstance(users, list) and not users):
        url = f"{SUPA_URL}/auth/v1/admin/users?{q}"
        req = urllib.request.Request(
            url,
            headers={
                "apikey": SRV_KEY,
                "Authorization": f"Bearer {SRV_KEY}",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            payload = json.loads(r.read().decode() or "{}")
        found = [u for u in payload.get("users", []) if u.get("email", "").lower() == ADMIN_EMAIL.lower()]
        if not found:
            fail(f"مستخدم E2E admin '{ADMIN_EMAIL}' غير موجود في auth.users.")

    print(
        f"[verify-resched] OK — doctor={doc['name_ar']!r} "
        f"window={lo}..{hi} slots={len(slots)} target={tgt_hhmm} matches={len(matches)} "
        f"admin_ok=1"
    )


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode()
        except Exception:
            pass
        fail(f"HTTP {e.code}: {body[:400]}")
    except Exception as e:  # noqa: BLE001
        fail(f"exception: {e}")
