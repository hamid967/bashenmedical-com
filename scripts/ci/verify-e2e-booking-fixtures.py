"""
CI preflight: يتحقق أن fixtures الحجز E2E موجودة وأن availability_slots
تحتوي على أوقات صالحة (status='available' في المستقبل) قبل تشغيل مجموعة
اختبارات الحجز. يُستدعى BeforeEach لمجموعة booking في .github/workflows/ci.yml.

يفشل مبكراً وبرسالة واضحة إذا:
  - أي fixture (branch/specialty/doctor) مفقود
  - doctor_branches غير مربوط
  - لا يوجد أي slot متاح في الأيام الـ 14 القادمة

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

اختياري:
  E2E_MIN_AVAILABLE_SLOTS  الحد الأدنى (افتراضي 3)
  E2E_BRANCH_SLUG          افتراضي 'e2e-branch'
  E2E_SPECIALTY_SLUG       افتراضي 'e2e-specialty'
  E2E_DOCTOR_SLUG          افتراضي 'e2e-doctor'

Exit: 0 عند الاجتياز، 1 عند الفشل.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import date, timedelta

REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
_missing = [k for k in REQUIRED if not os.environ.get(k, "").strip()]
if _missing:
    print(f"[verify] متغيّرات مفقودة: {', '.join(_missing)}", file=sys.stderr)
    sys.exit(1)

SUPA_URL = os.environ["SUPABASE_URL"].rstrip("/")
SRV_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip()

BRANCH_SLUG = os.environ.get("E2E_BRANCH_SLUG", "e2e-branch")
SPEC_SLUG = os.environ.get("E2E_SPECIALTY_SLUG", "e2e-specialty")
DOC_SLUG = os.environ.get("E2E_DOCTOR_SLUG", "e2e-doctor")
MIN_SLOTS = int(os.environ.get("E2E_MIN_AVAILABLE_SLOTS", "3"))


def rest_get(path: str, params: dict[str, str]) -> list[dict]:
    url = f"{SUPA_URL}/rest/v1/{path}?{urllib.parse.urlencode(params)}"
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
    print(f"[verify][FAIL] {msg}", file=sys.stderr)
    print(
        "→ شغّل: python scripts/ci/ensure-e2e-booking-fixtures.py ثم أعد المحاولة.",
        file=sys.stderr,
    )
    sys.exit(1)


def main() -> None:
    # 1) fixtures وجود
    branches = rest_get("branches", {"select": "id,slug,name", "slug": f"eq.{BRANCH_SLUG}"})
    if not branches:
        fail(f"الفرع '{BRANCH_SLUG}' غير موجود.")
    branch = branches[0]

    specs = rest_get("specialties", {"select": "id,slug,name", "slug": f"eq.{SPEC_SLUG}"})
    if not specs:
        fail(f"التخصص '{SPEC_SLUG}' غير موجود.")
    spec = specs[0]

    doctors = rest_get(
        "doctors",
        {"select": "id,slug,name,specialty_id,branch_id", "slug": f"eq.{DOC_SLUG}"},
    )
    if not doctors:
        fail(f"الطبيب '{DOC_SLUG}' غير موجود.")
    doc = doctors[0]

    if doc.get("specialty_id") != spec["id"]:
        fail(f"الطبيب غير مرتبط بالتخصص المطلوب (got {doc.get('specialty_id')}).")

    # 2) doctor_branches ربط
    links = rest_get(
        "doctor_branches",
        {
            "select": "doctor_id,branch_id",
            "doctor_id": f"eq.{doc['id']}",
            "branch_id": f"eq.{branch['id']}",
        },
    )
    if not links:
        fail("doctor_branches: لا يوجد ربط للطبيب E2E بالفرع E2E.")

    # 3) availability_slots — على الأقل MIN_SLOTS متاحة في المستقبل
    today = date.today().isoformat()
    horizon = (date.today() + timedelta(days=14)).isoformat()
    slots = rest_get(
        "availability_slots",
        {
            "select": "slot_date,start_time,status",
            "doctor_id": f"eq.{doc['id']}",
            "status": "eq.available",
            "slot_date": f"gte.{today}",
            "slot_date": f"lte.{horizon}",  # noqa: F601 — postgrest يقبل مكرر
            "limit": "500",
        },
    )
    # PostgREST querystring المكرر يحتفظ بآخر قيمة فقط لنفس المفتاح؛
    # نحتاج نمط and=() لدمج الشرطين معًا:
    slots = rest_get(
        "availability_slots",
        {
            "select": "slot_date,start_time,status",
            "doctor_id": f"eq.{doc['id']}",
            "status": "eq.available",
            "and": f"(slot_date.gte.{today},slot_date.lte.{horizon})",
            "limit": "500",
        },
    )
    if len(slots) < MIN_SLOTS:
        fail(
            f"عدد الـ slots المتاحة ({len(slots)}) أقل من الحد الأدنى "
            f"({MIN_SLOTS}) للطبيب E2E خلال 14 يوم."
        )

    unique_days = {s["slot_date"] for s in slots}
    print(
        f"[verify] OK — branch={branch['name']!r} specialty={spec['name']!r} "
        f"doctor={doc['name']!r} available_slots={len(slots)} days={len(unique_days)}"
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
