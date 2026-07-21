"""
E2E: إلغاء موعد من /portal/appointments

الخطوات:
  1) عبر SERVICE_ROLE_KEY (خارج المتصفح):
     - تحديث profiles.phone للمستخدم E2E admin إلى رقم ثابت للاختبار.
     - إدراج موعد مستقبلي (بعد 30 يومًا) بحالة 'new'، بـ patient_phone
       مطابق لرقم البروفايل + reason فريدة (E2E_CANCEL_<ts>) لتحديد
       الكرت في واجهة القائمة.
  2) داخل المتصفح:
     - تسجيل الدخول بجلسة Supabase عبر localStorage (نفس نمط
       admin_opens_for_admin_user.py).
     - فتح /portal/appointments.
     - العثور على الكرت الذي يحوي reason الفريدة، الضغط "إلغاء".
     - تأكيد داخل مودال "إلغاء الموعد".
     - التحقق من:
         (أ) ظهور toast Sonner "تم إلغاء الموعد".
         (ب) تحوّل حالة الموعد إلى "ملغى" (إمّا يختفي من فلتر "قادمة"
             ويظهر في "الكل" بحالة ملغى، أو تنعكس بشكل فوري).
         (ج) صف الموعد في DB status='cancelled' و cancelled_at != null.
  3) تنظيف: حذف الموعد الاختباري من قاعدة البيانات (دائمًا، حتى عند الفشل).

Env:
  E2E_BASE_URL              default http://localhost:8080
  E2E_ARTIFACTS             default ./e2e-artifacts
  E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD  (مطلوبة — وإلا يُخطَّى الاختبار)
  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (مطلوبان لبذر/تنظيف الموعد)

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

# رقم هاتف ثابت للاختبار — نضبطه في profiles.phone ونستخدمه في patient_phone
E2E_PHONE = "0555088624"
E2E_PATIENT_NAME = "مريض إلغاء اختبار E2E"
UNIQUE_REASON = f"E2E_CANCEL_{int(time.time())}"


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
        # لا يوجد profile — أنشئه
        status, body = _srv_req(
            "/rest/v1/profiles",
            method="POST",
            body={"id": user_id, "phone": E2E_PHONE},
            extra_headers={"Prefer": "return=representation,resolution=merge-duplicates"},
        )
        if status >= 300:
            raise RuntimeError(f"فشل إنشاء profile: HTTP {status} — {body[:300]}")


def insert_appointment() -> str:
    future = (date.today() + timedelta(days=30)).isoformat()
    payload = {
        "appointment_date": future,
        "appointment_time": "10:00:00",
        "status": "new",
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
        f"/rest/v1/appointments?id=eq.{appt_id}&select=id,status,cancelled_at,reason",
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
    print(f"[info] seeded appointment id={appt_id} reason={UNIQUE_REASON!r}")

    ok = False
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx, art = await make_recording_context(browser, name="portal-cancel", locale="ar-SA")
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
            # الصفحة تحتاج fetch — انتظر حتى يُعرض العنوان "قادمة" أو قائمة
            await retry_async(
                lambda: page.wait_for_selector(
                    f"text={UNIQUE_REASON}", timeout=15_000
                ),
                label="wait seeded appointment card",
            )
            await page.screenshot(path=str(shots / "01_list.png"))

            # الكرت الحاوي reason الفريدة
            card = page.locator("li", has_text=UNIQUE_REASON).first
            if await card.count() == 0:
                raise AssertionError("لم يظهر كرت الموعد المزروع في القائمة.")

            # زر "إلغاء" داخل الكرت (أول ActionButton بلون danger عليه النص)
            cancel_btn = card.get_by_role("button", name="إلغاء").first
            await cancel_btn.wait_for(state="visible", timeout=5_000)
            await retry_click(cancel_btn)

            # مودال "إلغاء الموعد"
            modal = page.get_by_role("dialog", name="إلغاء الموعد")
            await modal.wait_for(state="visible", timeout=5_000)
            await page.screenshot(path=str(shots / "02_modal.png"))

            confirm_btn = modal.get_by_role("button", name="تأكيد الإلغاء")
            await retry_click(confirm_btn)

            # (أ) toast Sonner
            toast = page.locator("li[data-sonner-toast]", has_text="تم إلغاء الموعد")
            try:
                await toast.first.wait_for(state="visible", timeout=8_000)
                toast_ok = True
            except Exception:
                toast_ok = False
            await page.screenshot(path=str(shots / "03_toast.png"))

            # (ب) الموعد يختفي من فلتر "قادمة" بعد إعادة الجلب
            await retry_async(
                lambda: page.wait_for_function(
                    f"""() => !Array.from(document.querySelectorAll('li'))
                        .some(li => li.innerText.includes({json.dumps(UNIQUE_REASON)}))""",
                    timeout=8_000,
                ),
                label="wait card removed from upcoming",
                attempts=2,
            )

            # (ج) DB state
            row = fetch_appointment(appt_id)
            if not row:
                raise AssertionError("تعذّر قراءة صف الموعد بعد الإلغاء.")
            if row.get("status") != "cancelled" or not row.get("cancelled_at"):
                raise AssertionError(
                    f"حالة الموعد في DB لم تتحدّث: {row!r}"
                )

            if not toast_ok:
                raise AssertionError("لم يظهر toast «تم إلغاء الموعد».")

            print(f"[pass] تم الإلغاء بنجاح — DB status={row['status']} "
                  f"cancelled_at={row['cancelled_at']}")
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
