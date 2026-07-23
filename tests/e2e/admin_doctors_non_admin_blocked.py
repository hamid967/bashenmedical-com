"""
E2E: غير الأدمن ممنوع من الوصول لـ /admin/doctors ومن الكتابة على public.doctors.

طبقتان يتحقق منهما هذا الاختبار:

  1) طبقة الواجهة (Playwright):
     - يسجّل الدخول كمريض (E2E_PATIENT_EMAIL/PASSWORD).
     - يفتح /admin/doctors كـ deep link.
     - يتوقّع إعادة توجيه بعيدًا عن /admin (بيتم عبر beforeLoad في
       src/routes/_authenticated/admin.tsx). إن بقيت الصفحة على /admin
       فيجب أن تظهر رسالة صلاحيات عربية ("لا تملك صلاحية") — بدون تسرّب
       أي محتوى إنجليزي مثل "Unauthorized/Forbidden".

  2) طبقة REST/RLS مباشرة (urllib):
     - كنفس المستخدم، يحاول INSERT/UPDATE/DELETE على public.doctors
       عبر PostgREST. تُرفض كل محاولة بـ 401/403 أو رسالة PostgREST مثل
       "permission denied" / "violates row-level security".

يُخطَّى الاختبار إن لم تتوفر بيانات المريض. Exit 0 = pass/skipped، 1 = fail.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import urllib.error
import urllib.request

from playwright.async_api import async_playwright


BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
SUPA_URL = "https://rcerbsywuovcleqybumg.supabase.co"
SUPA_KEY = "sb_publishable_jCNv8mbgtiQaIWkms_cHiA_9WUH_qEG"
PROJECT_REF = "rcerbsywuovcleqybumg"
STORAGE_KEY = f"sb-{PROJECT_REF}-auth-token"

PATIENT_EMAIL = os.environ.get("E2E_PATIENT_EMAIL", "").strip()
PATIENT_PASSWORD = os.environ.get("E2E_PATIENT_PASSWORD", "").strip()


def password_sign_in(email: str, password: str) -> dict:
    req = urllib.request.Request(
        f"{SUPA_URL}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"apikey": SUPA_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    raw = urllib.request.urlopen(req).read()
    d = json.loads(raw)
    return {
        "access_token": d["access_token"],
        "refresh_token": d["refresh_token"],
        "expires_in": d.get("expires_in", 3600),
        "expires_at": d.get("expires_at"),
        "token_type": d.get("token_type", "bearer"),
        "user": d["user"],
    }


def _rest(method: str, path: str, token: str, body: dict | None = None):
    data = None
    headers = {
        "apikey": SUPA_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    if body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/{path}", data=data, headers=headers, method=method
    )
    try:
        resp = urllib.request.urlopen(req)
        return resp.status, resp.read().decode(errors="ignore")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="ignore")


def probe_rest_denied(token: str) -> list[str]:
    """يعيد قائمة أخطاء لأي محاولة كتابة نجحت خلافًا للمتوقع."""
    errors: list[str] = []

    # 1) INSERT
    code, body = _rest(
        "POST",
        "doctors",
        token,
        {"name_ar": "regression-non-admin", "name_en": "regression-non-admin"},
    )
    if code < 400 and "permission" not in body.lower() and "row-level" not in body.lower():
        errors.append(f"[rest] INSERT على public.doctors نجح بغير أدمن — HTTP {code} {body[:200]}")

    # 2) UPDATE (على أي صف — اسم منسي)
    code, body = _rest(
        "PATCH",
        "doctors?is_active=eq.true&limit=1",
        token,
        {"name_en": "hijacked-by-non-admin"},
    )
    if code < 400 and body.strip() not in ("", "[]"):
        errors.append(f"[rest] UPDATE على public.doctors نجح بغير أدمن — HTTP {code} {body[:200]}")

    # 3) DELETE
    code, body = _rest("DELETE", "doctors?is_active=eq.true&limit=1", token)
    if code < 400 and body.strip() not in ("", "[]"):
        errors.append(f"[rest] DELETE على public.doctors نجح بغير أدمن — HTTP {code} {body[:200]}")

    return errors


async def probe_ui_redirect(session: dict) -> list[str]:
    errors: list[str] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        await page.goto(BASE, wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(json.dumps(session))})"
        )

        await page.goto(f"{BASE}/admin/doctors", wait_until="domcontentloaded")
        try:
            await page.wait_for_function(
                "!window.location.pathname.startsWith('/admin')", timeout=10_000
            )
        except Exception:
            pass

        path = await page.evaluate("window.location.pathname")
        body_text = await page.evaluate("document.body.innerText")
        print(f"[info] non-admin landed on {path!r}")

        if path.startswith("/admin"):
            if "لا تملك صلاحية" not in body_text and "غير مصرح" not in body_text:
                errors.append(
                    f"غير الأدمن بقي على {path} بدون رسالة صلاحيات عربية."
                )
            for leak in ["Unauthorized", "Forbidden", "Not allowed"]:
                if leak.lower() in body_text.lower():
                    errors.append(f"تسرّبت رسالة إنجليزية للأدمن: {leak!r}")

        # جدول إدارة الأطباء يجب ألا يظهر
        if "إدارة الأطباء" in body_text and path.startswith("/admin"):
            errors.append("محتوى صفحة إدارة الأطباء ظهر لغير الأدمن.")

        await browser.close()
    return errors


async def main() -> int:
    if not PATIENT_EMAIL or not PATIENT_PASSWORD:
        print("[skip] E2E_PATIENT_EMAIL/PASSWORD غير متوفرَين.")
        return 0

    try:
        session = password_sign_in(PATIENT_EMAIL, PATIENT_PASSWORD)
    except Exception as e:
        print(f"[fail] تعذّر تسجيل الدخول كمريض: {e}")
        return 1

    token = session["access_token"]
    rest_errors = probe_rest_denied(token)
    ui_errors = await probe_ui_redirect(session)

    all_errors = rest_errors + ui_errors
    if all_errors:
        for e in all_errors:
            print(f"[fail] {e}")
        return 1

    print("[ok] غير الأدمن ممنوع فعليًا من الوصول لـ /admin/doctors ومن الكتابة على public.doctors.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
