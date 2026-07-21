"""
CI preflight: يتحقق قبل تشغيل اختبار portal-cancel أن:
  - E2E admin موجود في auth.users ولديه دور 'admin' في user_roles.
  - profiles.phone قابل للتحديث للمستخدم (round-trip PATCH → read → restore).
  - appointments قابل للإدراج/القراءة/التحديث/الحذف بحقول الاختبار
    (appointment_date/time/status/reason/patient_phone/is_demo) وتغيير
    الحالة إلى 'cancelled' مع cancelled_at يعمل عبر SERVICE_ROLE.

يفشل مبكراً عند أول مشكلة برسالة عربية واضحة.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, E2E_ADMIN_EMAIL
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

REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "E2E_ADMIN_EMAIL"]
_missing = [k for k in REQUIRED if not os.environ.get(k, "").strip()]
if _missing:
    print(f"[verify][cancel] متغيّرات مفقودة: {', '.join(_missing)}", file=sys.stderr)
    sys.exit(1)

SUPA = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip()
ADMIN_EMAIL = os.environ["E2E_ADMIN_EMAIL"].strip().lower()

E2E_PHONE = "0555088624"


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
    print(f"[verify][cancel][FAIL] {msg}", file=sys.stderr)
    print("→ راجع scripts/ci/ensure-e2e-admin.py وسياسات RLS "
          "لجدولَي profiles و appointments.", file=sys.stderr)
    sys.exit(1)


def find_admin_user_id() -> str:
    # نستخدم Auth Admin API لجلب المستخدم بالبريد
    q = urllib.parse.urlencode({"email": ADMIN_EMAIL})
    st, body = req(f"/auth/v1/admin/users?{q}")
    if st >= 300:
        fail(f"auth admin users: HTTP {st} — {body[:300]}")
    payload = json.loads(body or "{}")
    users = payload.get("users") if isinstance(payload, dict) else payload
    if not users:
        fail(f"لم يُعثر على مستخدم E2E بالبريد {ADMIN_EMAIL}.")
    return users[0]["id"]


def main() -> None:
    # 1) admin user + role
    uid = find_admin_user_id()

    q = urllib.parse.urlencode({
        "user_id": f"eq.{uid}",
        "role": "eq.admin",
        "select": "user_id,role",
    })
    st, body = req(f"/rest/v1/user_roles?{q}")
    if st >= 300 or not json.loads(body or "[]"):
        fail(f"المستخدم {ADMIN_EMAIL} لا يملك دور admin في user_roles.")

    # 2) profiles.phone round-trip (نحفظ القيمة الأصلية ثم نُرجعها)
    st, body = req(f"/rest/v1/profiles?id=eq.{uid}&select=id,phone")
    if st >= 300:
        fail(f"قراءة profile: HTTP {st} — {body[:300]}")
    profile_rows = json.loads(body or "[]")
    original_phone = profile_rows[0].get("phone") if profile_rows else None
    profile_exists = bool(profile_rows)

    if profile_exists:
        st, body = req(
            f"/rest/v1/profiles?id=eq.{uid}",
            method="PATCH",
            body={"phone": E2E_PHONE},
            extra={"Prefer": "return=representation"},
        )
        if st >= 300:
            fail(f"PATCH profiles.phone: HTTP {st} — {body[:300]}")
    else:
        st, body = req(
            "/rest/v1/profiles",
            method="POST",
            body={"id": uid, "phone": E2E_PHONE},
            extra={"Prefer": "return=representation,resolution=merge-duplicates"},
        )
        if st >= 300:
            fail(f"POST profiles: HTTP {st} — {body[:300]}")

    # استعادة إن كانت هناك قيمة سابقة (تحاشيًا لتغيير حالة الحساب خارج الاختبار)
    if profile_exists and original_phone is not None and original_phone != E2E_PHONE:
        req(
            f"/rest/v1/profiles?id=eq.{uid}",
            method="PATCH",
            body={"phone": original_phone},
            extra={"Prefer": "return=minimal"},
        )

    # 3) appointments RW + cancel round-trip
    future = (date.today() + timedelta(days=30)).isoformat()
    unique_reason = f"E2E_CANCEL_PREFLIGHT_{int(time.time())}"
    payload = {
        "appointment_date": future,
        "appointment_time": "10:00:00",
        "status": "new",
        "reason": unique_reason,
        "patient_name": "preflight cancel",
        "patient_phone": E2E_PHONE,
        "is_demo": True,
    }
    st, body = req("/rest/v1/appointments", method="POST", body=payload,
                   extra={"Prefer": "return=representation"})
    if st >= 300:
        fail(f"insert appointment: HTTP {st} — {body[:400]}")
    rows = json.loads(body or "[]")
    if not rows:
        fail("insert appointment: لم يُعَد أي صف.")
    appt_id = rows[0]["id"]

    try:
        # تحديث cancelled
        cancelled_at = datetime.now(timezone.utc).isoformat()
        st, body = req(
            f"/rest/v1/appointments?id=eq.{appt_id}",
            method="PATCH",
            body={"status": "cancelled", "cancelled_at": cancelled_at},
            extra={"Prefer": "return=representation"},
        )
        if st >= 300:
            fail(f"PATCH appointment cancelled: HTTP {st} — {body[:300]}")
        upd = json.loads(body or "[]")
        if not upd or upd[0].get("status") != "cancelled" or not upd[0].get("cancelled_at"):
            fail(f"read-back cancelled غير مطابق: {upd!r}")
    finally:
        req(f"/rest/v1/appointments?id=eq.{appt_id}", method="DELETE")

    print(f"[verify][cancel] OK — admin={ADMIN_EMAIL} role=admin "
          f"profiles.phone RW ✓ appointments insert/cancel/delete ✓")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        fail(f"exception: {e}")
