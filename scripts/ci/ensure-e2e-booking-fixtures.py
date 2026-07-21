"""
CI helper: يزرع (seed) بيانات حجز حقيقية ثابتة لاختبارات E2E.

Idempotent — يمكن تشغيله عدة مرات دون تكرار. جميع الصفوف مُميّزة بـ
slug يبدأ بـ 'e2e-' لتنظيف آمن ومحدود عبر cleanup-e2e-booking-fixtures.py.

يعتمد على PostgREST + service_role key (يتخطى RLS) بنفس نمط
scripts/ci/ensure-e2e-admin.py.

Fixtures:
  branches           → slug='e2e-branch'
  specialties        → slug='e2e-specialty'
  doctors            → slug='e2e-doctor' (مرتبط بالتخصص والفرع أعلاه)
  doctor_branches    → ربط primary
  availability_slots → 14 يوم × 6 سلوتس/يوم (09:00–12:00 كل 30د)

المتطلبات (env):
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

Exit codes: 0 نجاح | 1 فشل / تكوين ناقص
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
_missing = [k for k in REQUIRED if not os.environ.get(k, "").strip()]
if _missing:
    print(f"[fail] متغيّرات مفقودة: {', '.join(_missing)}", file=sys.stderr)
    sys.exit(1)

SUPA_URL = os.environ["SUPABASE_URL"].rstrip("/")
SRV_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip()

BRANCH_SLUG = "e2e-branch"
SPECIALTY_SLUG = "e2e-specialty"
DOCTOR_SLUG = "e2e-doctor"

BRANCH_NAME_AR = "فرع اختبار E2E"
BRANCH_NAME_EN = "E2E Test Branch"
SPECIALTY_NAME_AR = "تخصص اختبار"
SPECIALTY_NAME_EN = "E2E Specialty"
DOCTOR_NAME_AR = "د. اختبار E2E"
DOCTOR_NAME_EN = "Dr. E2E Test"

DAYS_AHEAD = 14
# 6 half-hour slots: 09:00, 09:30, 10:00, 10:30, 11:00, 11:30
SLOT_TIMES = [(f"{h:02d}:{m:02d}:00", f"{h:02d}:{m+30:02d}:00") if m == 0
              else (f"{h:02d}:{m:02d}:00", f"{h+1:02d}:00:00")
              for h in range(9, 12) for m in (0, 30)]

BASE_HEADERS = {
    "apikey": SRV_KEY,
    "Authorization": f"Bearer {SRV_KEY}",
    "Content-Type": "application/json",
}


def _req(method: str, path: str, *, body=None, headers=None, params=None):
    url = f"{SUPA_URL}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={**BASE_HEADERS, **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read().decode()
            return res.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="ignore")
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = raw
        return e.code, parsed


def upsert(table: str, rows: list[dict], on_conflict: str, *, return_all: bool = True):
    """POST /rest/v1/{table} with merge-duplicates → true upsert."""
    prefer = "resolution=merge-duplicates"
    if return_all:
        prefer += ",return=representation"
    status, body = _req(
        "POST", f"/rest/v1/{table}",
        body=rows,
        headers={"Prefer": prefer},
        params={"on_conflict": on_conflict},
    )
    if status >= 300:
        raise RuntimeError(f"upsert {table} failed [{status}]: {body}")
    return body or []


def select(table: str, *, params: dict):
    status, body = _req("GET", f"/rest/v1/{table}", params=params)
    if status >= 300:
        raise RuntimeError(f"select {table} failed [{status}]: {body}")
    return body or []


def ensure_branch() -> str:
    row = upsert("branches", [{
        "slug": BRANCH_SLUG,
        "name_ar": BRANCH_NAME_AR,
        "name_en": BRANCH_NAME_EN,
        "city_ar": "الرياض",
        "city_en": "Riyadh",
        "is_active": True,
        "sort_order": 9999,
        "description_ar": "فرع مخصّص لاختبارات E2E — لا تحذفه يدويًا.",
        "description_en": "Dedicated branch for E2E tests — do not delete manually.",
    }], on_conflict="slug")[0]
    return row["id"]


def ensure_specialty() -> str:
    row = upsert("specialties", [{
        "slug": SPECIALTY_SLUG,
        "name_ar": SPECIALTY_NAME_AR,
        "name_en": SPECIALTY_NAME_EN,
        "is_active": True,
        "sort_order": 9999,
        "description_ar": "تخصص لاختبارات E2E فقط.",
        "description_en": "E2E-only specialty.",
    }], on_conflict="slug")[0]
    return row["id"]


def ensure_doctor(specialty_id: str, branch_id: str) -> str:
    row = upsert("doctors", [{
        "slug": DOCTOR_SLUG,
        "name_ar": DOCTOR_NAME_AR,
        "name_en": DOCTOR_NAME_EN,
        "title_ar": "استشاري",
        "title_en": "Consultant",
        "specialty_id": specialty_id,
        "branch_id": branch_id,
        "gender": "male",
        "is_active": True,
        "languages": ["ar", "en"],
        "sort_order": 9999,
        "bio_ar": "طبيب افتراضي لاختبارات E2E.",
        "bio_en": "Placeholder doctor for E2E tests.",
    }], on_conflict="slug")[0]
    return row["id"]


def ensure_doctor_branch_link(doctor_id: str, branch_id: str) -> None:
    upsert("doctor_branches", [{
        "doctor_id": doctor_id,
        "branch_id": branch_id,
        "is_primary": True,
    }], on_conflict="doctor_id,branch_id", return_all=False)


def ensure_slots(doctor_id: str, branch_id: str) -> int:
    """
    Upsert 14 days × 6 slots, only 'available' status. Uses the unique
    (doctor_id, slot_date, start_time) index for conflict resolution so
    re-runs keep existing bookings intact (we never overwrite a 'booked'
    slot back to 'available' — see filter below).
    """
    today = date.today()
    rows = []
    for offset in range(DAYS_AHEAD):
        d = today + timedelta(days=offset)
        for start, end in SLOT_TIMES:
            rows.append({
                "doctor_id": doctor_id,
                "branch_id": branch_id,
                "slot_date": d.isoformat(),
                "start_time": start,
                "end_time": end,
                "status": "available",
                "appointment_id": None,
            })

    # First find slots already 'booked' → don't touch them.
    existing = select("availability_slots", params={
        "doctor_id": f"eq.{doctor_id}",
        "slot_date": f"gte.{today.isoformat()}",
        "select": "slot_date,start_time,status",
    })
    booked = {(r["slot_date"], r["start_time"]) for r in existing if r.get("status") == "booked"}
    fresh = [r for r in rows if (r["slot_date"], r["start_time"]) not in booked]

    if not fresh:
        return 0
    upsert("availability_slots", fresh,
           on_conflict="doctor_id,slot_date,start_time",
           return_all=False)
    return len(fresh)


def emit_gh_output(name: str, value: str):
    out = os.environ.get("GITHUB_OUTPUT")
    if not out:
        return
    with open(out, "a", encoding="utf-8") as f:
        f.write(f"{name}={value}\n")


def main():
    print(f"[seed] target: {SUPA_URL}")
    branch_id = ensure_branch()
    print(f"[seed] branch     ok  id={branch_id}  slug={BRANCH_SLUG}")
    specialty_id = ensure_specialty()
    print(f"[seed] specialty  ok  id={specialty_id}  slug={SPECIALTY_SLUG}")
    doctor_id = ensure_doctor(specialty_id, branch_id)
    print(f"[seed] doctor     ok  id={doctor_id}  slug={DOCTOR_SLUG}")
    ensure_doctor_branch_link(doctor_id, branch_id)
    print("[seed] doctor_branches link ok")
    n = ensure_slots(doctor_id, branch_id)
    print(f"[seed] availability_slots upserted: {n}")

    emit_gh_output("branch_id", branch_id)
    emit_gh_output("specialty_id", specialty_id)
    emit_gh_output("doctor_id", doctor_id)
    emit_gh_output("branch_slug", BRANCH_SLUG)
    emit_gh_output("doctor_slug", DOCTOR_SLUG)
    print("[seed] done ✓")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"[fail] {exc}", file=sys.stderr)
        sys.exit(1)
