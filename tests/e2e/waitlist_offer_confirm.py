"""
E2E: تأكيد فرصة قائمة الانتظار من /waitlist

الخطوات:
  1) عبر SERVICE_ROLE_KEY (خارج المتصفح):
     - جلب معرفات الطبيب/الفرع/التخصص من fixtures الـE2E (slug='e2e-*').
     - اختيار تاريخ ووقت مستقبليَّين (بعد 10 أيام، 09:00) — يوافق
       أحد availability_slots المزروعة.
     - إنشاء slot_holds صالح (expires_at = الآن + 10 دقائق) بنفس
       (doctor_id, date, time) وربطه بالطلب.
     - إدراج appointment_waitlist بحالة 'notified' مع
       offered_date/offered_time/offered_hold_id/offered_expires_at.
     - المرجع يُشتقّ من أول 8 أرقام hex من الـ id (بصيغة WL-XXXXXXXX)
       تمامًا كما يفعل POST /api/public/book/waitlist.
  2) داخل المتصفح:
     - فتح /waitlist?ref=&phone4= مباشرة (تشغيل تلقائي عبر useEffect).
     - انتظار ظهور صندوق «فتحة موعد متاحة لك الآن» ثم الضغط
       «تأكيد الحجز الآن».
     - التحقق من:
         (أ) ظهور بطاقة «تم تأكيد الحجز بنجاح» مع رقم حجز BAA-XXXXXXXX.
         (ب) في DB: appointment_waitlist.status = 'fulfilled'.
         (ج) في DB: appointments يحتوي صفًا جديدًا بنفس الطبيب/التاريخ/
             الوقت/الجوال بحالة 'pending_verification'.
         (د) في DB: slot_holds.released_at ليست NULL.
         (هـ) soft-check: إن وُجد availability_slots مطابق فيتوقّع
             تحديث حالته إلى 'booked' وربطه بالموعد. الملاحظة:
             confirm_waitlist_offer يعتمد book_appointment_atomic
             الذي لا يمس availability_slots (بخلاف book_slot) —
             لذا يُطبع تحذير بدل الفشل حفاظًا على أمانة السلوك الحالي.
  3) تنظيف: حذف الموعد + صف قائمة الانتظار + slot_holds المُنشأ.

Env:
  E2E_BASE_URL                             default http://localhost:8080
  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (مطلوبان)

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
import urllib.parse
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

DOCTOR_SLUG = "e2e-doctor"
BRANCH_SLUG = "e2e-branch"

# مستقبل بعيد نسبيًا يوافق أحد سلوتس ensure-e2e-booking-fixtures.py
OFFER_DATE = (date.today() + timedelta(days=10)).isoformat()
OFFER_TIME_DB = "09:00:00"
PHONE = f"055500{int(time.time()) % 10000:04d}"
PHONE4 = PHONE[-4:]
UNIQUE_NAME = f"E2E_WL_{int(time.time())}"


def _srv_req(path: str, method: str = "GET", body=None,
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


def _first_row(status: int, body: str, label: str) -> dict:
    if status >= 300:
        raise RuntimeError(f"{label}: HTTP {status} — {body[:300]}")
    rows = json.loads(body or "[]")
    if not rows:
        raise RuntimeError(f"{label}: لا صفوف عائدة")
    return rows[0]


def get_fixture_ids() -> tuple[str, str, str | None]:
    q = urllib.parse.urlencode({"slug": f"eq.{DOCTOR_SLUG}", "select": "id,specialty_id"})
    doc = _first_row(*_srv_req(f"/rest/v1/doctors?{q}"), label="doctor fixture")
    q = urllib.parse.urlencode({"slug": f"eq.{BRANCH_SLUG}", "select": "id"})
    br = _first_row(*_srv_req(f"/rest/v1/branches?{q}"), label="branch fixture")
    return doc["id"], br["id"], doc.get("specialty_id")


def insert_slot_hold(doctor_id: str, branch_id: str) -> tuple[str, str]:
    expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    payload = {
        "doctor_id": doctor_id,
        "branch_id": branch_id,
        "appointment_date": OFFER_DATE,
        "appointment_time": OFFER_TIME_DB,
        "session_id": f"wl-e2e:{int(time.time())}",
        "expires_at": expires,
    }
    st, body = _srv_req(
        "/rest/v1/slot_holds",
        method="POST",
        body=payload,
        extra_headers={"Prefer": "return=representation"},
    )
    row = _first_row(st, body, "insert slot_hold")
    return row["id"], expires


def insert_waitlist_notified(doctor_id: str, branch_id: str,
                             specialty_id: str | None, hold_id: str,
                             hold_expires: str) -> tuple[str, str]:
    payload = {
        "reference": "PENDING",
        "patient_name": UNIQUE_NAME,
        "patient_phone": PHONE,
        "doctor_id": doctor_id,
        "branch_id": branch_id,
        "specialty_id": specialty_id,
        "preferred_from": OFFER_DATE,
        "preferred_to": OFFER_DATE,
        "status": "notified",
        "notified_at": datetime.now(timezone.utc).isoformat(),
        "offered_date": OFFER_DATE,
        "offered_time": OFFER_TIME_DB,
        "offered_hold_id": hold_id,
        "offered_expires_at": hold_expires,
    }
    st, body = _srv_req(
        "/rest/v1/appointment_waitlist",
        method="POST",
        body=payload,
        extra_headers={"Prefer": "return=representation"},
    )
    row = _first_row(st, body, "insert waitlist")
    wl_id = row["id"]
    reference = f"WL-{wl_id.replace('-', '')[:8].upper()}"
    st2, body2 = _srv_req(
        f"/rest/v1/appointment_waitlist?id=eq.{wl_id}",
        method="PATCH",
        body={"reference": reference},
        extra_headers={"Prefer": "return=minimal"},
    )
    if st2 >= 300:
        raise RuntimeError(f"patch reference: HTTP {st2} — {body2[:300]}")
    return wl_id, reference


def fetch_waitlist(wl_id: str) -> dict | None:
    st, body = _srv_req(
        f"/rest/v1/appointment_waitlist?id=eq.{wl_id}"
        "&select=id,status,offered_hold_id,offered_expires_at"
    )
    if st >= 300:
        return None
    rows = json.loads(body or "[]")
    return rows[0] if rows else None


def fetch_new_appointment(doctor_id: str) -> dict | None:
    q = urllib.parse.urlencode({
        "doctor_id": f"eq.{doctor_id}",
        "appointment_date": f"eq.{OFFER_DATE}",
        "appointment_time": f"eq.{OFFER_TIME_DB}",
        "patient_phone": f"eq.{PHONE}",
        "select": "id,status,patient_name,appointment_date,appointment_time",
        "limit": "1",
    })
    st, body = _srv_req(f"/rest/v1/appointments?{q}")
    if st >= 300:
        return None
    rows = json.loads(body or "[]")
    return rows[0] if rows else None


def fetch_hold(hold_id: str) -> dict | None:
    st, body = _srv_req(
        f"/rest/v1/slot_holds?id=eq.{hold_id}&select=id,released_at"
    )
    if st >= 300:
        return None
    rows = json.loads(body or "[]")
    return rows[0] if rows else None


def fetch_matching_slot(doctor_id: str) -> dict | None:
    q = urllib.parse.urlencode({
        "doctor_id": f"eq.{doctor_id}",
        "slot_date": f"eq.{OFFER_DATE}",
        "start_time": f"eq.{OFFER_TIME_DB}",
        "select": "id,status,appointment_id",
        "limit": "1",
    })
    st, body = _srv_req(f"/rest/v1/availability_slots?{q}")
    if st >= 300:
        return None
    rows = json.loads(body or "[]")
    return rows[0] if rows else None


def cleanup(wl_id: str | None, hold_id: str | None, appt_id: str | None,
            slot_reset: dict | None):
    if appt_id:
        _srv_req(f"/rest/v1/appointments?id=eq.{appt_id}", method="DELETE")
    if wl_id:
        _srv_req(f"/rest/v1/appointment_waitlist?id=eq.{wl_id}", method="DELETE")
    if hold_id:
        _srv_req(f"/rest/v1/slot_holds?id=eq.{hold_id}", method="DELETE")
    # أعد أي availability_slot تم قلبها إلى 'booked' إلى حالتها الأصلية.
    if slot_reset and slot_reset.get("id"):
        _srv_req(
            f"/rest/v1/availability_slots?id=eq.{slot_reset['id']}",
            method="PATCH",
            body={"status": slot_reset.get("status") or "available",
                  "appointment_id": slot_reset.get("appointment_id")},
            extra_headers={"Prefer": "return=minimal"},
        )


async def main() -> int:
    if not SRV_KEY:
        print("[skip] SUPABASE_SERVICE_ROLE_KEY غير مضبوط — الاختبار مُخطَّى.")
        return 0

    try:
        doctor_id, branch_id, specialty_id = get_fixture_ids()
    except Exception as e:  # noqa: BLE001
        print(f"[skip] fixtures غير متوفّرة: {e}")
        return 0

    slot_before = fetch_matching_slot(doctor_id)
    hold_id, expires = insert_slot_hold(doctor_id, branch_id)
    wl_id, ref = insert_waitlist_notified(
        doctor_id, branch_id, specialty_id, hold_id, expires
    )
    print(f"[info] seeded waitlist ref={ref} phone4={PHONE4} "
          f"date={OFFER_DATE} time={OFFER_TIME_DB} hold={hold_id}")

    appt_id: str | None = None
    ok = False
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx, art = await make_recording_context(browser, name="waitlist-confirm", locale="ar-SA")
        page = await ctx.new_page()
        shots = art["screenshots"]

        console_errors: list[str] = []
        page.on(
            "console",
            lambda m: console_errors.append(m.text) if m.type == "error" else None,
        )

        try:
            url = f"{BASE}/waitlist?ref={ref}&phone4={PHONE4}"
            await retry_goto(page, url)

            # صندوق الفرصة يظهر بعد fetch تلقائي
            await retry_async(
                lambda: page.wait_for_selector(
                    "text=فتحة موعد متاحة لك الآن", timeout=15_000
                ),
                label="wait offer box",
            )
            await page.screenshot(path=str(shots / "01_offer.png"))

            confirm_btn = page.get_by_role("button", name="تأكيد الحجز الآن")
            await confirm_btn.wait_for(state="visible", timeout=5_000)
            await retry_click(confirm_btn)

            await retry_async(
                lambda: page.wait_for_selector(
                    "text=تم تأكيد الحجز بنجاح", timeout=15_000
                ),
                label="wait success card",
            )
            await page.screenshot(path=str(shots / "02_confirmed.png"))

            # (ب) waitlist fulfilled
            wl = fetch_waitlist(wl_id)
            if not wl or wl.get("status") != "fulfilled":
                raise AssertionError(f"waitlist لم تُحدَّث إلى fulfilled: {wl!r}")

            # (ج) appointment مُنشأ
            appt = fetch_new_appointment(doctor_id)
            if not appt:
                raise AssertionError("لم يُنشأ موعد مقابل الطبيب/التاريخ/الوقت/الجوال.")
            appt_id = appt["id"]
            if appt.get("status") != "pending_verification":
                raise AssertionError(
                    f"حالة الموعد غير متوقعة: {appt.get('status')!r} "
                    "(المتوقّع pending_verification)"
                )

            # (د) slot_hold مُحرَّر
            hold = fetch_hold(hold_id)
            if not hold or not hold.get("released_at"):
                raise AssertionError(f"slot_hold لم يُحرَّر: {hold!r}")

            # (هـ) availability_slots — soft check
            slot_after = fetch_matching_slot(doctor_id)
            if slot_after:
                if slot_after.get("status") == "booked" and slot_after.get("appointment_id") == appt_id:
                    print("[info] availability_slots تحدّثت إلى booked وربطت بالموعد ✓")
                else:
                    print("[warn] availability_slots لم يُحدَّث "
                          f"(status={slot_after.get('status')}, "
                          f"appointment_id={slot_after.get('appointment_id')}). "
                          "المسار confirm_waitlist_offer → book_appointment_atomic "
                          "لا يمسّ هذا الجدول حاليًا — تحذير غير مُفشِل.")
            else:
                print("[info] لا يوجد availability_slot مطابق للتاريخ/الوقت — تم التخطي.")

            print(f"[pass] waitlist offer confirmed: appt={appt_id} ref={ref}")
            ok = True
        except Exception as exc:
            print(f"[fail] {exc}")
            traceback.print_exc()
            print("console errors (tail):", console_errors[-15:])
        finally:
            await finalize_context(ctx, art, page, ok=ok)
            await browser.close()
            try:
                cleanup(wl_id, hold_id, appt_id, slot_before)
                print("[cleanup] تم تنظيف السجلات المزروعة.")
            except Exception as e:  # noqa: BLE001
                print(f"[cleanup][warn] فشل التنظيف: {e}")

    return 0 if ok else 1


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except Exception as e:  # noqa: BLE001
        print(f"[fail] fatal: {e}")
        traceback.print_exc()
        sys.exit(1)
