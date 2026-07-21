"""
CI helper: يضمن وجود طبيب اختبار + branch + availability_slot متاح في
نافذة (الآن + 24h .. الآن + 48h) كي لا تعتمد اختبارات /book على بيانات
إنتاجية متغيّرة.

المتطلبات:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

Exit codes: 0 = ok, 1 = فشل.

هذا السكربت idempotent: يبحث عن الطبيب بالبريد المميّز
`e2e-doctor@bashenmedical.local`؛ إن لم يوجد يُنشئ الحدّ الأدنى.
"""
from __future__ import annotations
import json, os, sys, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone

REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
missing = [k for k in REQUIRED if not os.environ.get(k, "").strip()]
if missing:
    print(f"[fail] متغيّرات مفقودة: {', '.join(missing)}", file=sys.stderr)
    sys.exit(1)

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip()

H = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def req(method: str, path: str, body=None, extra: dict | None = None):
    url = f"{URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method,
                                headers={**H, **(extra or {})})
    try:
        with urllib.request.urlopen(r) as res:
            raw = res.read().decode()
            return res.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="ignore")


def rest(method, table, params="", body=None, extra=None):
    return req(method, f"/rest/v1/{table}{params}", body, extra)


DOCTOR_MARK = "e2e-fixture-doctor"
BRANCH_MARK = "e2e-fixture-branch"


def get_or_create_branch() -> str:
    code, rows = rest("GET", "branches",
                      f"?select=id&name_en=eq.{BRANCH_MARK}&limit=1")
    if code == 200 and rows:
        return rows[0]["id"]
    code, rows = rest("POST", "branches", body={
        "name_en": BRANCH_MARK,
        "name_ar": "فرع الاختبار",
        "city_en": "Jeddah",
        "city_ar": "جدة",
        "is_active": True,
    })
    if code >= 300:
        print(f"[fail] branch create: {code} {rows}", file=sys.stderr); sys.exit(1)
    return rows[0]["id"]


def get_or_create_doctor(branch_id: str) -> str:
    code, rows = rest("GET", "doctors",
                      f"?select=id&full_name_en=eq.{DOCTOR_MARK}&limit=1")
    if code == 200 and rows:
        return rows[0]["id"]
    code, rows = rest("POST", "doctors", body={
        "full_name_en": DOCTOR_MARK,
        "full_name_ar": "طبيب الاختبار",
        "slug": "e2e-fixture-doctor",
        "branch_id": branch_id,
        "is_active": True,
        "languages": ["ar", "en"],
    })
    if code >= 300:
        print(f"[fail] doctor create: {code} {rows}", file=sys.stderr); sys.exit(1)
    return rows[0]["id"]


def ensure_slot(doctor_id: str, branch_id: str):
    target = (datetime.now(timezone.utc) + timedelta(hours=30)).date().isoformat()
    code, rows = rest(
        "GET", "availability_slots",
        f"?select=id&doctor_id=eq.{doctor_id}&date=eq.{target}&limit=1")
    if code == 200 and rows:
        return rows[0]["id"]
    code, rows = rest("POST", "availability_slots", body={
        "doctor_id": doctor_id,
        "branch_id": branch_id,
        "date": target,
        "start_time": "10:00",
        "end_time": "10:30",
        "is_available": True,
    })
    if code >= 300:
        print(f"[warn] slot create failed (may already exist): {code} {rows}",
              file=sys.stderr)
        return None
    return rows[0]["id"]


def main():
    b = get_or_create_branch()
    d = get_or_create_doctor(b)
    s = ensure_slot(d, b)
    print(f"[ok] branch={b} doctor={d} slot={s}")


if __name__ == "__main__":
    main()
