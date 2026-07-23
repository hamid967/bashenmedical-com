"""
E2E: الأدمن يستطيع إجراء CRUD كامل على /admin/doctors عبر الواجهة.

الخطوات:
  1) تسجيل الدخول كأدمن (E2E_ADMIN_EMAIL/PASSWORD) عبر Supabase Auth
     REST، ثم كتابة الجلسة في localStorage.
  2) فتح /admin/doctors وانتظار جدول الإدارة.
  3) إنشاء (Create):
     - النقر على "إضافة طبيب"، تعبئة name_ar / name_en / slug فريدة،
     - النقر على "حفظ" وانتظار toast النجاح ("تم الحفظ بنجاح")
       وظهور الاسم داخل الجدول.
  4) تعديل (Update):
     - البحث بالاسم الجديد، النقر على زر التعديل، تغيير name_ar،
     - الحفظ وانتظار توست النجاح وظهور الاسم المعدَّل.
  5) حذف (Delete):
     - قبول نافذة confirm() تلقائيًا، انتظار توست "تم الحذف"،
     - التأكد أن الاسم لم يعد ظاهرًا في الجدول.
  6) تنظيف: عند فشل أي خطوة، نحاول DELETE عبر REST باستخدام slug الفريد.

يُخطَّى الاختبار إن لم تتوفر بيانات الأدمن أو لم يكن للمستخدم دور admin.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
import urllib.error
import urllib.request

from playwright.async_api import async_playwright, TimeoutError as PWTimeout


BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
SUPA_URL = "https://rcerbsywuovcleqybumg.supabase.co"
SUPA_KEY = "sb_publishable_jCNv8mbgtiQaIWkms_cHiA_9WUH_qEG"
PROJECT_REF = "rcerbsywuovcleqybumg"
STORAGE_KEY = f"sb-{PROJECT_REF}-auth-token"

ADMIN_EMAIL = os.environ.get("E2E_ADMIN_EMAIL", "").strip()
ADMIN_PASSWORD = os.environ.get("E2E_ADMIN_PASSWORD", "").strip()


def password_sign_in(email: str, password: str) -> dict:
    req = urllib.request.Request(
        f"{SUPA_URL}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"apikey": SUPA_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    d = json.loads(urllib.request.urlopen(req).read())
    return {
        "access_token": d["access_token"],
        "refresh_token": d["refresh_token"],
        "expires_in": d.get("expires_in", 3600),
        "expires_at": d.get("expires_at"),
        "token_type": d.get("token_type", "bearer"),
        "user": d["user"],
    }


def has_admin_role(uid: str, token: str) -> bool:
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/rpc/has_role",
        data=json.dumps({"_user_id": uid, "_role": "admin"}).encode(),
        headers={
            "apikey": SUPA_KEY,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        return json.loads(urllib.request.urlopen(req).read()) is True
    except Exception:
        return False


def cleanup_by_slug(token: str, slug: str) -> None:
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/doctors?slug=eq.{slug}",
        headers={
            "apikey": SUPA_KEY,
            "Authorization": f"Bearer {token}",
            "Prefer": "return=minimal",
        },
        method="DELETE",
    )
    try:
        urllib.request.urlopen(req).read()
    except urllib.error.HTTPError as e:
        print(f"[cleanup] DELETE by slug={slug} → HTTP {e.code} {e.read().decode(errors='ignore')[:120]}")
    except Exception as e:
        print(f"[cleanup] DELETE by slug={slug} فشل: {e}")


async def run_crud(session: dict) -> list[str]:
    errors: list[str] = []
    stamp = int(time.time())
    slug = f"e2e-doc-{stamp}"
    name_ar = f"طبيب اختبار {stamp}"
    name_ar_edit = f"{name_ar} (معدّل)"
    name_en = f"E2E Doctor {stamp}"

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        page.on("dialog", lambda d: asyncio.create_task(d.accept()))

        await page.goto(BASE, wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(json.dumps(session))})"
        )

        await page.goto(f"{BASE}/admin/doctors", wait_until="domcontentloaded")
        try:
            await page.get_by_role("heading", name="إدارة الأطباء").wait_for(timeout=15_000)
        except PWTimeout:
            errors.append("لم يظهر عنوان 'إدارة الأطباء' للأدمن.")
            await browser.close()
            return errors

        # -------- CREATE --------
        try:
            await page.get_by_role("button", name="إضافة طبيب").click()
            dialog = page.get_by_role("dialog")
            await dialog.wait_for(timeout=5_000)
            await dialog.locator("input").nth(0).fill(name_ar)  # الاسم بالعربية
            await dialog.locator("input").nth(1).fill(name_en)  # Name (English)
            # حقل الـ slug: نبحث عن input داخل حقل Slug (placeholder=dr-name)
            await dialog.locator('input[placeholder="dr-name"]').fill(slug)
            await dialog.get_by_role("button", name="حفظ").click()
            # انتظر توست النجاح
            await page.get_by_text("تم الحفظ بنجاح").first.wait_for(timeout=10_000)
            # واظهور الاسم في الجدول
            await page.get_by_text(name_ar, exact=True).first.wait_for(timeout=10_000)
        except PWTimeout as e:
            errors.append(f"فشل CREATE: {e}")

        # -------- UPDATE --------
        if not errors:
            try:
                await page.locator('input[placeholder*="ابحث"]').fill(name_ar)
                row = page.locator("tr", has_text=name_ar).first
                await row.get_by_label("تعديل").click()
                dialog = page.get_by_role("dialog")
                await dialog.wait_for(timeout=5_000)
                ar_input = dialog.locator("input").nth(0)
                await ar_input.fill(name_ar_edit)
                await dialog.get_by_role("button", name="حفظ").click()
                await page.get_by_text("تم الحفظ بنجاح").first.wait_for(timeout=10_000)
                await page.get_by_text(name_ar_edit, exact=True).first.wait_for(timeout=10_000)
            except PWTimeout as e:
                errors.append(f"فشل UPDATE: {e}")

        # -------- DELETE --------
        if not errors:
            try:
                await page.locator('input[placeholder*="ابحث"]').fill(name_ar_edit)
                row = page.locator("tr", has_text=name_ar_edit).first
                await row.get_by_label("حذف").click()
                await page.get_by_text("تم الحذف").first.wait_for(timeout=10_000)
                # لم يعد ظاهرًا
                still_visible = await page.get_by_text(name_ar_edit, exact=True).count()
                if still_visible:
                    errors.append("الصف بقي ظاهرًا بعد الحذف.")
            except PWTimeout as e:
                errors.append(f"فشل DELETE: {e}")

        await browser.close()

    # تنظيف احتياطي دومًا (لن يجد شيئًا لو الحذف عمل).
    cleanup_by_slug(session["access_token"], slug)
    return errors


async def main() -> int:
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        print("[skip] E2E_ADMIN_EMAIL/PASSWORD غير متوفرَين.")
        return 0
    try:
        session = password_sign_in(ADMIN_EMAIL, ADMIN_PASSWORD)
    except Exception as e:
        print(f"[fail] تعذّر تسجيل الدخول كأدمن: {e}")
        return 1

    uid = session["user"]["id"]
    if not has_admin_role(uid, session["access_token"]):
        print(f"[fail] المستخدم {ADMIN_EMAIL} لا يملك دور admin.")
        return 1

    errors = await run_crud(session)
    if errors:
        for e in errors:
            print(f"[fail] {e}")
        return 1

    print("[ok] الأدمن أنجز CRUD كاملًا على /admin/doctors.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
