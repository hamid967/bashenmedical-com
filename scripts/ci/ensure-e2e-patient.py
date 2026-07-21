"""
CI helper: يضمن وجود مستخدم E2E-patient ثابت لاختبارات Visual Regression لبوابة المريض.

مطابق في الأسلوب لـ ensure-e2e-admin.py، لكن بدون منح أي دور — فقط:
  1) إنشاء المستخدم في Supabase Auth مع email_confirm=true (تخطّي تأكيد البريد).
  2) تحديث كلمة السر كل مرة لتطابق $E2E_PATIENT_PASSWORD (ضدّ التدوير).
  3) upsert صف profile في public.profiles بالاسم/الجوال ليعرض الـportal
     محتوى ثابتاً لا يعتمد على بيانات مستخدم حقيقي.
  4) التأكد صراحةً أن المستخدم لا يملك أي دور في public.user_roles
     (منع تحويل المستخدم عن طريق الخطأ إلى admin/staff).

المتطلبات (env vars):
  SUPABASE_URL                 - رابط المشروع (مثل https://xxx.supabase.co)
  SUPABASE_SERVICE_ROLE_KEY    - مفتاح service_role (سرّي)
  E2E_PATIENT_EMAIL            - بريد مستخدم اختبار البوابة
  E2E_PATIENT_PASSWORD         - كلمة السر التي ستستخدمها الاختبارات
  E2E_PATIENT_FULL_NAME        - اختياري (افتراضي: "Visual Regression Patient")
  E2E_PATIENT_PHONE            - اختياري (افتراضي: "+966500000000")

Exit codes:
  0 = ok (المستخدم + الـprofile جاهزان)
  1 = فشل / تكوين ناقص
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from urllib.parse import quote

REQUIRED = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "E2E_PATIENT_EMAIL",
    "E2E_PATIENT_PASSWORD",
]
missing = [k for k in REQUIRED if not os.environ.get(k, "").strip()]
if missing:
    print(f"[fail] متغيّرات مفقودة: {', '.join(missing)}", file=sys.stderr)
    sys.exit(1)

SUPA_URL = os.environ["SUPABASE_URL"].rstrip("/")
SRV_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip()
EMAIL = os.environ["E2E_PATIENT_EMAIL"].strip()
PASSWORD = os.environ["E2E_PATIENT_PASSWORD"]
FULL_NAME = os.environ.get("E2E_PATIENT_FULL_NAME", "Visual Regression Patient").strip()
PHONE = os.environ.get("E2E_PATIENT_PHONE", "+966500000000").strip()

ADMIN_HEADERS = {
    "apikey": SRV_KEY,
    "Authorization": f"Bearer {SRV_KEY}",
    "Content-Type": "application/json",
}


def http(method: str, path: str, body: dict | list | None = None,
         headers: dict | None = None) -> tuple[int, dict | list | str]:
    url = f"{SUPA_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={**ADMIN_HEADERS, **(headers or {})})
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read().decode()
            return res.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="ignore")
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = raw
        return e.code, parsed


def find_user_id(email: str) -> str | None:
    code, body = http("GET", f"/auth/v1/admin/users?filter=email.eq.{quote(email)}")
    if code == 200 and isinstance(body, dict):
        for u in body.get("users", []):
            if (u.get("email") or "").lower() == email.lower():
                return u["id"]
    code, body = http("GET", "/auth/v1/admin/users?per_page=200")
    if code == 200 and isinstance(body, dict):
        for u in body.get("users", []):
            if (u.get("email") or "").lower() == email.lower():
                return u["id"]
    return None


def create_user() -> str:
    code, body = http("POST", "/auth/v1/admin/users", {
        "email": EMAIL,
        "password": PASSWORD,
        "email_confirm": True,
        "user_metadata": {
            "purpose": "e2e-patient-visual",
            "full_name": FULL_NAME,
            "phone": PHONE,
        },
    })
    if code in (200, 201) and isinstance(body, dict) and body.get("id"):
        print(f"[ok] أُنشئ مستخدم E2E-patient: {EMAIL} (id={body['id']})")
        return body["id"]
    if code in (409, 422):
        raise FileExistsError(json.dumps(body, ensure_ascii=False))
    raise RuntimeError(f"فشل إنشاء المستخدم [HTTP {code}] {body!r}")


def update_password_and_confirm(user_id: str) -> None:
    code, body = http("PUT", f"/auth/v1/admin/users/{user_id}", {
        "password": PASSWORD,
        "email_confirm": True,
    })
    if code != 200:
        raise RuntimeError(
            f"فشل تحديث كلمة السر للمستخدم {user_id} [HTTP {code}] {body!r}"
        )
    print(f"[ok] كلمة السر مُحدَّثة و email_confirm=true للمستخدم {user_id}")


def upsert_profile(user_id: str) -> None:
    # PostgREST upsert بمفتاح service_role → يتجاوز RLS.
    code, body = http(
        "POST",
        "/rest/v1/profiles",
        {"id": user_id, "full_name": FULL_NAME, "phone": PHONE},
        headers={
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    if code in (200, 201, 204):
        print(f"[ok] profile مضمون في public.profiles للمستخدم {user_id}")
        return
    raise RuntimeError(
        f"فشل upsert للـprofile للمستخدم {user_id} [HTTP {code}] {body!r}"
    )


def assert_no_roles(user_id: str) -> None:
    """
    مستخدم Visual Regression يجب أن يبقى مريضاً عادياً. لو تسرّب دور admin
    (مثلاً نتيجة اختبار قديم) نحذف كل صفوفه من user_roles لضمان أن اللقطات
    تعكس تجربة مريض حقيقية.
    """
    code, body = http(
        "DELETE",
        f"/rest/v1/user_roles?user_id=eq.{user_id}",
        headers={"Prefer": "return=representation"},
    )
    if code in (200, 204):
        removed = len(body) if isinstance(body, list) else 0
        if removed:
            print(f"[ok] حُذفت {removed} صف/صفوف دور مسرَّبة من user_roles")
        else:
            print(f"[ok] لا أدوار مسبقة على {user_id}")
        return
    # 404 يعني الجدول موجود بلا صف — مقبول.
    if code == 404:
        return
    raise RuntimeError(f"تعذّر التحقق من user_roles [HTTP {code}] {body!r}")


def main() -> int:
    uid = find_user_id(EMAIL)
    if uid is None:
        try:
            uid = create_user()
        except FileExistsError:
            uid = find_user_id(EMAIL)
            if uid is None:
                print("[fail] 'already exists' لكن المستخدم غير مرئي في القائمة.",
                      file=sys.stderr)
                return 1
            print(f"[ok] المستخدم موجود مسبقًا: {EMAIL} (id={uid})")
            update_password_and_confirm(uid)
    else:
        print(f"[ok] المستخدم موجود: {EMAIL} (id={uid})")
        update_password_and_confirm(uid)

    upsert_profile(uid)
    assert_no_roles(uid)
    print("[done] مستخدم E2E-patient جاهز لاختبارات Visual Regression.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"[fail] {e}", file=sys.stderr)
        sys.exit(1)
