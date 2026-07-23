"""
E2E: غير الأدمن يستطيع فقط قراءة قائمة الأطباء المفعّلين، بلا أي CRUD،
ولا تظهر له عناصر تحكم "تعديل/حذف/إضافة" في واجهة `/admin/doctors`.

طبقتان:

  1) REST (PostgREST) — عبر توكن مريض عادي:
     - GET /rest/v1/doctors?is_active=eq.true → 200 مع صفوف (قراءة مسموحة
       عبر سياسة "read active doctors" ذات USING (is_active = true)).
     - GET /rest/v1/doctors?is_active=eq.false → يجب ألا يعيد أي صف
       (السياسة تحجب غير المفعّلين).
     - POST/PATCH/DELETE → مرفوضة (401/403 أو رسالة RLS).

  2) UI (Playwright) — يزور /admin/doctors كمريض:
     - `beforeLoad` في admin.tsx يعيد التوجيه إلى /portal، وبالتالي:
       * أزرار "إضافة طبيب" و "تعديل" و "حذف" يجب ألا تظهر.
       * عنوان "إدارة الأطباء" يجب ألا يظهر.
     - إن لم يحدث redirect لأي سبب، فيجب أن تكون كل عناصر CRUD مخفية
       أو معطّلة — لا نقبل ظهور زر تعديل/حذف/إضافة قابل للنقر لغير الأدمن.

يُخطَّى الاختبار إن لم تتوفر بيانات مريض. Exit 0 = pass/skipped، 1 = fail.
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


def probe_rest_readonly(token: str) -> list[str]:
    errors: list[str] = []

    # 1) قراءة الأطباء المفعّلين مسموحة
    code, body = _rest("GET", "doctors?is_active=eq.true&select=id,is_active&limit=5", token)
    if code != 200:
        errors.append(f"[rest] GET doctors(active) فشل — HTTP {code} {body[:200]}")
    else:
        try:
            rows = json.loads(body)
            if not isinstance(rows, list):
                errors.append(f"[rest] GET doctors(active) لم يعِد قائمة: {body[:200]}")
            else:
                for r in rows:
                    if r.get("is_active") is not True:
                        errors.append(
                            f"[rest] GET doctors(active) أعاد صفًا غير مفعّل: {r}"
                        )
                        break
        except Exception as e:
            errors.append(f"[rest] GET doctors(active) JSON غير صالح: {e}")

    # 2) الأطباء غير المفعّلين يجب ألا يتسرّبوا
    code, body = _rest("GET", "doctors?is_active=eq.false&select=id&limit=5", token)
    if code == 200:
        try:
            rows = json.loads(body)
            if isinstance(rows, list) and len(rows) > 0:
                errors.append(
                    f"[rest] غير الأدمن رأى {len(rows)} أطباء غير مفعّلين — سياسة RLS مخترقة."
                )
        except Exception:
            pass

    # 3) الكتابة ممنوعة
    code, body = _rest(
        "POST", "doctors", token,
        {"name_ar": "readonly-probe", "name_en": "readonly-probe"},
    )
    if code < 400:
        errors.append(f"[rest] INSERT نجح لغير أدمن — HTTP {code} {body[:200]}")

    code, body = _rest(
        "PATCH", "doctors?is_active=eq.true&limit=1", token,
        {"name_en": "hijacked-readonly"},
    )
    if code < 400 and body.strip() not in ("", "[]"):
        errors.append(f"[rest] UPDATE نجح لغير أدمن — HTTP {code} {body[:200]}")

    code, body = _rest("DELETE", "doctors?is_active=eq.true&limit=1", token)
    if code < 400 and body.strip() not in ("", "[]"):
        errors.append(f"[rest] DELETE نجح لغير أدمن — HTTP {code} {body[:200]}")

    return errors


async def probe_ui_no_crud(session: dict) -> list[str]:
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
        await page.wait_for_timeout(500)

        path = await page.evaluate("window.location.pathname")
        body_text = await page.evaluate("document.body.innerText")
        print(f"[info] non-admin landed on {path!r}")

        # لا يجب أن يظهر عنوان صفحة إدارة الأطباء
        if "إدارة الأطباء" in body_text:
            errors.append("عنوان 'إدارة الأطباء' ظهر لغير الأدمن.")

        # فحص أزرار CRUD — يجب ألا تكون موجودة وقابلة للنقر
        add_btn = page.get_by_role("button", name="إضافة طبيب")
        edit_btns = page.get_by_role("button", name="تعديل")
        delete_btns = page.get_by_role("button", name="حذف")

        for name, loc in (("إضافة طبيب", add_btn), ("تعديل", edit_btns), ("حذف", delete_btns)):
            count = await loc.count()
            if count > 0:
                # لو ظهرت، يجب أن تكون معطّلة
                first_enabled = await loc.first.is_enabled()
                if first_enabled:
                    errors.append(
                        f"زر '{name}' ظاهر ومفعّل لغير الأدمن (count={count})."
                    )

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
    rest_errors = probe_rest_readonly(token)
    ui_errors = await probe_ui_no_crud(session)

    all_errors = rest_errors + ui_errors
    if all_errors:
        for e in all_errors:
            print(f"[fail] {e}")
        return 1

    print("[ok] غير الأدمن يقرأ الأطباء المفعّلين فقط، بلا CRUD وبلا أزرار تحرير/حذف.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
