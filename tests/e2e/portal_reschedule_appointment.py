"""
E2E: إعادة جدولة موعد من /portal/appointments

الخطوات:
  1) عبر SERVICE_ROLE_KEY (خارج المتصفح):
     - ضبط profiles.phone للمستخدم E2E admin على رقم اختبار ثابت.
     - إدراج موعد مستقبلي (بعد 30 يومًا 10:00) بحالة 'confirmed'
       بـ patient_phone مطابق و reason فريدة (E2E_RESCHED_<ts>).
  2) داخل المتصفح:
     - حقن جلسة Supabase عبر localStorage.
     - فتح /portal/appointments.
     - داخل الكرت الحاوي reason الفريدة: الضغط "إعادة جدولة".
     - داخل مودال "إعادة جدولة الموعد": تعبئة تاريخ +45 يومًا و 14:30
       ثم الضغط "تأكيد".
     - التحقق من:
         (أ) ظهور toast Sonner "تمت إعادة الجدولة".
         (ب) الموعد ما زال ضمن قائمة "قادمة" ويعرض الوقت 14:30
             (تحديث حي بعد invalidate).
         (ج) في DB: appointment_date == +45d،
             appointment_time == '14:30:00'، status == 'new'.
  3) تنظيف: حذف الموعد الاختباري (دائمًا).

Env:
  E2E_BASE_URL              default http://localhost:8080
  E2E_ARTIFACTS             default ./e2e-artifacts
  E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD  (مطلوبة — وإلا يُخطَّى الاختبار)
  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (مطلوبان)

Exit: 0 pass/skip، 1 fail.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
import traceback
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _helpers import (  # noqa: E402
    finalize_context,
    make_recording_context,
    retry_async,
    retry_click,
    retry_goto,
)

from playwright.async_api import async_playwright  # noqa: E402

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
SUPA_URL = os.environ.get("SUPABASE_URL", "https://rcerbsywuovcleqybumg.supabase.co").rstrip("/")
SRV_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPA_PUB_KEY = "sb_publishable_jCNv8mbgtiQaIWkms_cHiA_9WUH_qEG"
PROJECT_REF = SUPA_URL.split("//", 1)[-1].split(".", 1)[0]
STORAGE_KEY = f"sb-{PROJECT_REF}-auth-token"

ADMIN_EMAIL = os.environ.get("E2E_ADMIN_EMAIL", "").strip()
ADMIN_PASSWORD = os.environ.get("E2E_ADMIN_PASSWORD", "").strip()

E2E_PHONE = "0555088624"
E2E_PATIENT_NAME = "مريض إعادة جدولة اختبار E2E"
UNIQUE_REASON = f"E2E_RESCHED_{int(time.time())}"

ORIGINAL_DATE = (date.today() + timedelta(days=30)).isoformat()
ORIGINAL_TIME = "10:00:00"
NEW_DATE = (date.today() + timedelta(days=45)).isoformat()
NEW_TIME_UI = "14:30"          # ما يُدخل في input[type=time]
NEW_TIME_DB = "14:30:00"       # ما يُخزَّن


# --------------------------------- REST utils ---------------------------------

def _srv_req(path: str, method: str = "GET", body: dict | list | None = None,
             extra_headers: dict | None = None) -> tuple[int, str]:
    url = f"{SUPA_URL}{path}"
    headers = {
        "apikey": SRV_KEY,
        "Authorization": f"Bearer {SRV_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read().decode() or ""
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="ignore")


def password_sign_in(email: str, password: str) -> dict:
    req = urllib.request.Request(
        f"{SUPA_URL}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"apikey": SUPA_PUB_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    raw = urllib.request.urlopen(req, timeout=20).read()
    d = json.loads(raw)
    return {
        "access_token": d["access_token"],
        "refresh_token": d["refresh_token"],
        "expires_in": d.get("expires_in", 3600),
        "expires_at": d.get("expires_at"),
        "token_type": d.get("token_type", "bearer"),
        "user": d["user"],
    }


def upsert_admin_phone(user_id: str) -> None:
    status, body = _srv_req(
        f"/rest/v1/profiles?id=eq.{user_id}",
        method="PATCH",
        body={"phone": E2E_PHONE},
        extra_headers={"Prefer": "return=representation"},
    )
    if status >= 300:
        raise RuntimeError(f"فشل تحديث profiles.phone: HTTP {status} — {body[:300]}")
    if not json.loads(body or "[]"):
        status, body = _srv_req(
            "/rest/v1/profiles",
            method="POST",
            body={"id": user_id, "phone": E2E_PHONE},
            extra_headers={"Prefer": "return=representation,resolution=merge-duplicates"},
        )
        if status >= 300:
            raise RuntimeError(f"فشل إنشاء profile: HTTP {status} — {body[:300]}")


def insert_appointment() -> str:
    payload = {
        "appointment_date": ORIGINAL_DATE,
        "appointment_time": ORIGINAL_TIME,
        "status": "confirmed",
        "reason": UNIQUE_REASON,
        "patient_name": E2E_PATIENT_NAME,
        "patient_phone": E2E_PHONE,
        "is_demo": True,
    }
    status, body = _srv_req(
        "/rest/v1/appointments",
        method="POST",
        body=payload,
        extra_headers={"Prefer": "return=representation"},
    )
    if status >= 300:
        raise RuntimeError(f"فشل إدراج الموعد: HTTP {status} — {body[:400]}")
    rows = json.loads(body or "[]")
    if not rows:
        raise RuntimeError("لم يُعَد أي صف من إدراج الموعد.")
    return rows[0]["id"]


def fetch_appointment(appt_id: str) -> dict | None:
    status, body = _srv_req(
        f"/rest/v1/appointments?id=eq.{appt_id}"
        f"&select=id,status,appointment_date,appointment_time,reason",
    )
    if status >= 300:
        return None
    rows = json.loads(body or "[]")
    return rows[0] if rows else None


def delete_appointment(appt_id: str) -> None:
    _srv_req(f"/rest/v1/appointments?id=eq.{appt_id}", method="DELETE")


# ----------------------------------- main ------------------------------------

async def main() -> int:
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        print("[skip] E2E_ADMIN_EMAIL/PASSWORD غير مضبوطة — الاختبار مُخطَّى.")
        return 0
    if not SRV_KEY:
        print("[skip] SUPABASE_SERVICE_ROLE_KEY غير مضبوط — الاختبار مُخطَّى.")
        return 0

    session = password_sign_in(ADMIN_EMAIL, ADMIN_PASSWORD)
    uid = session.get("user", {}).get("id")
    if not uid:
        print("[fail] لم يُرجع تسجيل الدخول user.id.")
        return 1

    upsert_admin_phone(uid)
    appt_id = insert_appointment()
    print(f"[info] seeded appointment id={appt_id} reason={UNIQUE_REASON!r} "
          f"orig={ORIGINAL_DATE} {ORIGINAL_TIME} → target={NEW_DATE} {NEW_TIME_DB}")

    ok = False
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx, art = await make_recording_context(browser, name="portal-reschedule", locale="ar-SA")
        page = await ctx.new_page()
        shots = art["screenshots"]

        console_errors: list[str] = []
        page.on(
            "console",
            lambda m: console_errors.append(m.text) if m.type == "error" else None,
        )

        try:
            await retry_goto(page, BASE)
            await page.evaluate(
                f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, "
                f"{json.dumps(json.dumps(session))})"
            )

            await retry_goto(page, f"{BASE}/portal/appointments")
            await retry_async(
                lambda: page.wait_for_selector(
                    f"text={UNIQUE_REASON}", timeout=15_000
                ),
                label="wait seeded appointment card",
            )
            await page.screenshot(path=str(shots / "01_list.png"))

            card = page.locator("li", has_text=UNIQUE_REASON).first
            if await card.count() == 0:
                raise AssertionError("لم يظهر كرت الموعد المزروع في القائمة.")

            resched_btn = card.get_by_role("button", name="إعادة جدولة").first
            await resched_btn.wait_for(state="visible", timeout=5_000)
            await retry_click(resched_btn)

            modal = page.get_by_role("dialog", name="إعادة جدولة الموعد")
            await modal.wait_for(state="visible", timeout=5_000)
            await page.screenshot(path=str(shots / "02_modal.png"))

            # املأ التاريخ والوقت الجديدين
            date_input = modal.locator('input[type="date"]')
            time_input = modal.locator('input[type="time"]')
            await date_input.fill(NEW_DATE)
            await time_input.fill(NEW_TIME_UI)

            confirm_btn = modal.get_by_role("button", name="تأكيد")
            await retry_click(confirm_btn)

            # (أ) toast Sonner
            toast = page.locator("li[data-sonner-toast]", has_text="تمت إعادة الجدولة")
            try:
                await toast.first.wait_for(state="visible", timeout=8_000)
                toast_ok = True
            except Exception:
                toast_ok = False
            await page.screenshot(path=str(shots / "03_toast.png"))

            # (ب) الموعد ما زال في القائمة والوقت الجديد يظهر داخل الكرت
            await retry_async(
                lambda: page.wait_for_function(
                    f"""() => Array.from(document.querySelectorAll('li'))
                        .some(li => li.innerText.includes({json.dumps(UNIQUE_REASON)})
                                 && li.innerText.includes({json.dumps(NEW_TIME_UI)}))""",
                    timeout=10_000,
                ),
                label="wait card shows new time",
                attempts=2,
            )
            await page.screenshot(path=str(shots / "04_after.png"))

            # (ج) DB state
            row = fetch_appointment(appt_id)
            if not row:
                raise AssertionError("تعذّر قراءة صف الموعد بعد إعادة الجدولة.")
            if (row.get("appointment_date") != NEW_DATE
                    or row.get("appointment_time") != NEW_TIME_DB
                    or row.get("status") != "new"):
                raise AssertionError(
                    f"حالة الموعد في DB لم تتحدّث كما هو متوقّع: {row!r} "
                    f"(المتوقّع date={NEW_DATE} time={NEW_TIME_DB} status=new)"
                )

            if not toast_ok:
                raise AssertionError("لم يظهر toast «تمت إعادة الجدولة».")

            print(f"[pass] إعادة الجدولة تمّت — DB {row['appointment_date']} "
                  f"{row['appointment_time']} status={row['status']}")
            ok = True
        except Exception as exc:
            print(f"[fail] {exc}")
            traceback.print_exc()
            print("console errors (tail):", console_errors[-15:])
        finally:
            await finalize_context(ctx, art, page, ok=ok)
            await browser.close()
            try:
                delete_appointment(appt_id)
                print(f"[cleanup] حُذف الموعد {appt_id}")
            except Exception as e:  # noqa: BLE001
                print(f"[cleanup][warn] فشل الحذف: {e}")

    return 0 if ok else 1


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except Exception as e:  # noqa: BLE001
        print(f"[fail] fatal: {e}")
        traceback.print_exc()
        sys.exit(1)
