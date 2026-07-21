"""
E2E: التراجع عن الإلغاء في /reservations/manage خلال 30 ثانية.

الخطوات:
  1) عبر SERVICE_ROLE_KEY:
     - إدراج guest_reservation_sessions مُتحقّق منه (verified_at الآن،
       session_expires_at بعد ساعة) برقم جوال ثابت للاختبار.
     - إدراج موعد مستقبلي بحالة 'confirmed' بنفس رقم الجوال
       (patient_name فريد لتحديد الكرت).
  2) داخل المتصفح:
     - فتح /reservations/manage.
     - حقن sessionStorage['bmc-resv-session'] بالجلسة المُبذَّرة (يقفز
       الصفحة مباشرة إلى step='list').
     - انتظار ظهور كرت الموعد.
     - الضغط "إلغاء" → اختيار سبب → "تأكيد الإلغاء".
     - التحقق من ظهور بطاقة "تم إلغاء الحجز بنجاح" وزر "تراجع".
     - الضغط على "تراجع عن الإلغاء" خلال 30ث.
     - التحقق من ظهور بطاقة "تم استرجاع الحجز".
  3) DB assertion: appointments.status='confirmed' و cancelled_at IS NULL.
  4) Cleanup: حذف الموعد والجلسة (دائمًا).

Env:
  E2E_BASE_URL              default http://localhost:8080
  E2E_ARTIFACTS             default ./e2e-artifacts
  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (مطلوبان — وإلا يُخطَّى)

Exit: 0 pass/skip، 1 fail.
"""
from __future__ import annotations

import asyncio
import json
import os
import secrets
import sys
import time
import traceback
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
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
SUPA_URL = os.environ.get(
    "SUPABASE_URL", "https://rcerbsywuovcleqybumg.supabase.co"
).rstrip("/")
SRV_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

E2E_PHONE = f"05550{int(time.time()) % 100000:05d}"
UNIQUE_NAME = f"E2E مريض تراجع {int(time.time())}"


# --------------------------------- REST utils ---------------------------------

def _srv_req(
    path: str,
    method: str = "GET",
    body: dict | list | None = None,
    extra_headers: dict | None = None,
) -> tuple[int, str]:
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


def insert_session(token: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "phone": E2E_PHONE,
        "code_hash": "e2e-not-used",
        "code_expires_at": (now + timedelta(minutes=5)).isoformat(),
        "attempts": 0,
        "verified_at": now.isoformat(),
        "session_token": token,
        "session_expires_at": (now + timedelta(hours=1)).isoformat(),
        "ip": "127.0.0.1",
    }
    status, body = _srv_req(
        "/rest/v1/guest_reservation_sessions",
        method="POST",
        body=payload,
        extra_headers={"Prefer": "return=representation"},
    )
    if status >= 300:
        raise RuntimeError(f"فشل إدراج الجلسة: HTTP {status} — {body[:400]}")
    rows = json.loads(body or "[]")
    return rows[0]["id"]


def delete_session(token: str) -> None:
    _srv_req(
        f"/rest/v1/guest_reservation_sessions?session_token=eq.{token}",
        method="DELETE",
    )


def insert_appointment() -> str:
    future = (date.today() + timedelta(days=30)).isoformat()
    payload = {
        "appointment_date": future,
        "appointment_time": "11:00:00",
        "status": "confirmed",
        "reason": "E2E undo cancel",
        "patient_name": UNIQUE_NAME,
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
        "&select=id,status,cancelled_at,patient_phone",
    )
    if status >= 300:
        return None
    rows = json.loads(body or "[]")
    return rows[0] if rows else None


def delete_appointment(appt_id: str) -> None:
    _srv_req(f"/rest/v1/appointments?id=eq.{appt_id}", method="DELETE")


# ----------------------------------- main ------------------------------------

async def main() -> int:
    if not SRV_KEY:
        print("[skip] SUPABASE_SERVICE_ROLE_KEY غير مضبوط — الاختبار مُخطَّى.")
        return 0

    token = secrets.token_urlsafe(48)
    now_ms = int(time.time() * 1000)
    expires_iso = (
        datetime.now(timezone.utc) + timedelta(hours=1)
    ).isoformat()

    sess_id = insert_session(token)
    appt_id = insert_appointment()
    print(
        f"[info] seeded session id={sess_id} token_prefix={token[:8]}… "
        f"appt id={appt_id} phone={E2E_PHONE}"
    )

    ok = False
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx, art = await make_recording_context(
            browser, name="reservations-undo", locale="ar-SA"
        )
        page = await ctx.new_page()
        shots = art["screenshots"]

        console_errors: list[str] = []
        page.on(
            "console",
            lambda m: console_errors.append(m.text) if m.type == "error" else None,
        )

        try:
            # Establish origin, then inject sessionStorage before navigating
            # to the manage route so hydration finds a valid session.
            await retry_goto(page, BASE)
            payload = json.dumps(
                {"token": token, "expires": expires_iso, "phone_masked": "05****0000"}
            )
            await page.evaluate(
                "([k,v]) => window.sessionStorage.setItem(k, v)",
                ["bmc-resv-session", payload],
            )

            await retry_goto(page, f"{BASE}/reservations/manage")

            # Wait for our seeded appointment card to appear
            await retry_async(
                lambda: page.wait_for_selector(
                    f"text={UNIQUE_NAME}", timeout=15_000
                ),
                label="wait seeded appointment card",
            )
            await page.screenshot(path=str(shots / "01_list.png"))

            # The card containing our unique patient name
            card = page.locator("div", has_text=UNIQUE_NAME).first
            cancel_btn = card.get_by_role("button", name="إلغاء").first
            await cancel_btn.wait_for(state="visible", timeout=5_000)
            await retry_click(cancel_btn)

            # Reason step: pick a reason then confirm
            reason_btn = page.get_by_role("button", name="ظرف طارئ").first
            await reason_btn.wait_for(state="visible", timeout=5_000)
            await retry_click(reason_btn)

            confirm_btn = page.get_by_role("button", name="تأكيد الإلغاء")
            await retry_click(confirm_btn)

            # Wait for the "done" card to appear
            success_card = page.get_by_text("تم إلغاء الحجز بنجاح").first
            await success_card.wait_for(state="visible", timeout=10_000)
            await page.screenshot(path=str(shots / "02_cancelled.png"))

            # DB should reflect cancellation
            row = fetch_appointment(appt_id)
            if not row or row.get("status") != "cancelled":
                raise AssertionError(
                    f"لم تُحدَّث حالة الموعد إلى cancelled: {row!r}"
                )

            # Click Undo within the 30s window
            undo_btn = page.get_by_role(
                "button", name=lambda n: n and "تراجع عن الإلغاء" in n
            ).first
            await undo_btn.wait_for(state="visible", timeout=5_000)
            elapsed = (time.time() * 1000 - now_ms) / 1000
            if elapsed > 25:
                raise AssertionError(
                    f"استغرقت الخطوات {elapsed:.1f}ث قبل التراجع — خارج النافذة."
                )
            await retry_click(undo_btn)

            # Wait for the "restored" result card
            restored = page.get_by_text("تم استرجاع الحجز").first
            await restored.wait_for(state="visible", timeout=10_000)
            await page.screenshot(path=str(shots / "03_restored.png"))

            # DB assertion — status back to confirmed, cancelled_at cleared.
            # Allow a brief window for the update round-trip.
            row2 = None
            for _ in range(10):
                row2 = fetch_appointment(appt_id)
                if row2 and row2.get("status") == "confirmed" and not row2.get(
                    "cancelled_at"
                ):
                    break
                await asyncio.sleep(0.5)
            if (
                not row2
                or row2.get("status") != "confirmed"
                or row2.get("cancelled_at")
            ):
                raise AssertionError(
                    f"DB لم تعكس الاسترجاع: {row2!r}"
                )

            print(
                f"[pass] استرجاع ناجح — DB status={row2['status']} "
                f"cancelled_at={row2.get('cancelled_at')!r}"
            )
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
                print(f"[cleanup][warn] فشل حذف الموعد: {e}")
            try:
                delete_session(token)
                print("[cleanup] حُذفت جلسة الضيف.")
            except Exception as e:  # noqa: BLE001
                print(f"[cleanup][warn] فشل حذف الجلسة: {e}")

    return 0 if ok else 1


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except Exception as e:  # noqa: BLE001
        print(f"[fail] fatal: {e}")
        traceback.print_exc()
        sys.exit(1)
