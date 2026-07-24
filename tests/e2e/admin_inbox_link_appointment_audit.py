"""
Smoke test: /admin/inbox/$id — "ربط الموعد" flow.

Drives the actual detail-panel UI as a real admin session and verifies the
contract exposed by `linkInboxAppointment`:

  1. Filling the appointment UUID in the "ربط الموعد" panel and clicking
     "ربط" updates:
        - inbox_items.linked_appointment_id  → the appointment id
        - inbox_items.status                 → 'appointment_created'
        (both scoped through Data API as the same admin — RLS applies.)

  2. The step is recorded as an *immutable* audit event on `inbox_events`:
        - action == 'link_appointment'
        - payload_before.linked_appointment_id == prior value (null on first link)
        - payload_after.linked_appointment_id  == new appointment id
        - UPDATE and DELETE on that event row are refused by RLS.

  3. Clearing the link from the UI (empty UUID → "إلغاء الربط") appends a
     second `link_appointment` event with before=<appt>, after=null.
     Prior events remain untouched (audit trail preserved, no destructive
     edits).

Skips (exit 0) when:
  - No admin session available (no CI creds and no injected sandbox session).
  - No appointment row is readable by the admin (nothing to link).

Exit codes:
  0 = pass or skipped
  1 = fail
"""
from __future__ import annotations
import asyncio, json, os, sys, urllib.request, urllib.error, uuid
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
SUPA_URL = "https://rcerbsywuovcleqybumg.supabase.co"
SUPA_KEY = "sb_publishable_jCNv8mbgtiQaIWkms_cHiA_9WUH_qEG"

ADMIN_EMAIL = os.environ.get("E2E_ADMIN_EMAIL", "").strip()
ADMIN_PASSWORD = os.environ.get("E2E_ADMIN_PASSWORD", "").strip()
AUTH_STATUS = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "")
SESSION_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON", "")
STORAGE_KEY = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY", "")
COOKIES_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON", "")
ACCESS_TOKEN = os.environ.get("LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN", "")

SCREENSHOTS = Path("/tmp/browser/admin_inbox_link_appointment")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)


# ---------- HTTP helpers -------------------------------------------------

def _req(method, path, token, body=None, prefer=None):
    url = f"{SUPA_URL}/rest/v1/{path}"
    data = None if body is None else json.dumps(body).encode()
    headers = {
        "apikey": SUPA_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req)
        return resp.status, resp.read().decode() or ""
    except urllib.error.HTTPError as e:
        return e.code, (e.read().decode(errors="ignore") or "")


def password_sign_in(email, password):
    req = urllib.request.Request(
        f"{SUPA_URL}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"apikey": SUPA_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    d = json.loads(urllib.request.urlopen(req).read())
    return d["access_token"], d["user"]["id"], d.get("refresh_token", "")


def has_admin(uid, token):
    status, body = _req(
        "POST", "rpc/has_role", token,
        body={"_user_id": uid, "_role": "admin"},
    )
    return status == 200 and body.strip() == "true"


def resolve_session():
    """Returns (access_token, refresh_token, user_id, session_json_str)."""
    if ADMIN_EMAIL and ADMIN_PASSWORD:
        at, uid, rt = password_sign_in(ADMIN_EMAIL, ADMIN_PASSWORD)
        sess = {
            "access_token": at,
            "refresh_token": rt,
            "token_type": "bearer",
            "expires_in": 3600,
            "user": {"id": uid},
        }
        return at, rt, uid, json.dumps(sess)
    if AUTH_STATUS == "injected" and SESSION_JSON:
        try:
            s = json.loads(SESSION_JSON)
        except Exception:
            return None, None, None, None
        return (
            ACCESS_TOKEN or s.get("access_token", ""),
            s.get("refresh_token", ""),
            s.get("user", {}).get("id"),
            SESSION_JSON,
        )
    return None, None, None, None


# ---------- Test ---------------------------------------------------------

async def main() -> int:
    token, refresh, uid, session_str = resolve_session()
    if not token or not uid:
        print("[skip] لا توجد جلسة admin (لا CI creds ولا injected).")
        return 0
    if not has_admin(uid, token):
        print("[skip] الجلسة الحالية لا تملك دور admin.")
        return 0

    # -- Pick an appointment we can read (RLS filters). --
    s, b = _req(
        "GET",
        "appointments?select=id&limit=1&order=created_at.desc",
        token,
    )
    appts = json.loads(b) if s == 200 and b else []
    if not appts:
        print("[skip] لا يوجد موعد قابل للقراءة لهذا الحساب — لا شيء للربط.")
        return 0
    appointment_id = appts[0]["id"]
    print(f"[info] سيتم الربط بالموعد {appointment_id}")

    # -- Seed a dedicated inbox_item (owned by the admin session). --
    req_num = f"SMOKE-LINK-{uuid.uuid4().hex[:10].upper()}"
    s, b = _req(
        "POST", "inbox_items", token,
        body=[{
            "request_number": req_num,
            "source_table": "smoke_test",
            "channel": "support",
            "status": "new",
            "priority": "normal",
            "subject": "link-appointment audit smoke",
        }],
        prefer="return=representation",
    )
    if s not in (200, 201):
        print(f"[fail] cannot seed inbox_item: HTTP {s} — {b}")
        return 1
    item = json.loads(b)[0]
    item_id = item["id"]
    initial_status = item["status"]
    initial_link = item.get("linked_appointment_id")
    print(f"[info] seeded inbox_item {item_id} (status={initial_status}, linked={initial_link})")

    errors: list[str] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})

        # Restore session (cookies + localStorage). Cookies first, before nav.
        if COOKIES_JSON:
            try:
                cookies = json.loads(COOKIES_JSON)
                for c in cookies:
                    c["url"] = BASE
                await ctx.add_cookies(cookies)
            except Exception as e:
                print(f"[warn] cookies restore failed: {e}")

        page = await ctx.new_page()
        await page.goto(BASE, wait_until="domcontentloaded")
        if STORAGE_KEY and session_str:
            await page.evaluate(
                f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(session_str)})"
            )

        # -- Open the detail page. --
        await page.goto(f"{BASE}/admin/inbox/{item_id}", wait_until="domcontentloaded")
        try:
            await page.wait_for_selector("text=ربط الموعد", timeout=10_000)
        except Exception:
            await page.screenshot(path=str(SCREENSHOTS / "01_no_panel.png"))
            print("[fail] لم تظهر لوحة «ربط الموعد» على /admin/inbox/$id")
            await browser.close()
            return 1
        await page.screenshot(path=str(SCREENSHOTS / "02_detail.png"))

        # -- Fill the UUID and click "ربط". --
        input_locator = page.locator('input[placeholder*="UUID الموعد"]')
        await input_locator.fill(appointment_id)
        # Button in the same panel — text starts with "ربط".
        link_btn = page.get_by_role("button", name="ربط", exact=True)
        await link_btn.first.click()
        # Wait for the mutation to settle (toast / re-render).
        try:
            await page.wait_for_load_state("networkidle", timeout=8_000)
        except Exception:
            pass
        await page.screenshot(path=str(SCREENSHOTS / "03_after_link.png"))

        # -- 1) Verify inbox_items.linked_appointment_id + status. --
        s, b = _req(
            "GET",
            f"inbox_items?id=eq.{item_id}&select=linked_appointment_id,status",
            token,
        )
        rows = json.loads(b) if s == 200 else []
        if not rows:
            errors.append(f"cannot read inbox_item after link: HTTP {s} — {b}")
        else:
            row = rows[0]
            if row.get("linked_appointment_id") != appointment_id:
                errors.append(
                    f"linked_appointment_id لم يُحدَّث: "
                    f"expected={appointment_id} got={row.get('linked_appointment_id')}"
                )
            if row.get("status") != "appointment_created":
                errors.append(
                    f"status لم يُرقَّى تلقائيًا إلى appointment_created — got={row.get('status')}"
                )

        # -- 2) Verify a link_appointment audit event was appended. --
        s, b = _req(
            "GET",
            f"inbox_events?item_id=eq.{item_id}&action=eq.link_appointment"
            "&select=id,action,payload_before,payload_after,note"
            "&order=created_at.asc",
            token,
        )
        events = json.loads(b) if s == 200 else []
        if not events:
            errors.append("لم يُسجَّل حدث link_appointment في inbox_events")
        else:
            ev = events[0]
            before = (ev.get("payload_before") or {}).get("linked_appointment_id", "MISSING")
            after = (ev.get("payload_after") or {}).get("linked_appointment_id", "MISSING")
            if before not in (None, initial_link):
                errors.append(
                    f"payload_before.linked_appointment_id غير متوقع: {before!r}"
                )
            if after != appointment_id:
                errors.append(
                    f"payload_after.linked_appointment_id غير صحيح: "
                    f"expected={appointment_id} got={after!r}"
                )

            # 2b) immutability: UPDATE/DELETE on the event row are refused.
            ev_id = ev["id"]
            u_status, u_body = _req(
                "PATCH", f"inbox_events?id=eq.{ev_id}", token,
                body={"note": "TAMPERED-LINK"},
                prefer="return=representation",
            )
            u_rows = []
            try:
                u_rows = json.loads(u_body) if u_body.strip() else []
            except Exception:
                u_rows = []
            if u_status < 400 and u_rows:
                errors.append(
                    f"inbox_events UPDATE نجح على حدث الربط (HTTP {u_status})"
                )
            d_status, d_body = _req(
                "DELETE", f"inbox_events?id=eq.{ev_id}", token,
                prefer="return=representation",
            )
            d_rows = []
            try:
                d_rows = json.loads(d_body) if d_body.strip() else []
            except Exception:
                d_rows = []
            if d_status < 400 and d_rows:
                errors.append(
                    f"inbox_events DELETE نجح على حدث الربط (HTTP {d_status})"
                )
            # confirm row unchanged
            s, b = _req(
                "GET",
                f"inbox_events?id=eq.{ev_id}&select=note,payload_after",
                token,
            )
            v = json.loads(b) if s == 200 else []
            if not v:
                errors.append("حدث الربط اختفى بعد محاولات التعديل — سُجل قابل للحذف!")
            elif v[0].get("note") == "TAMPERED-LINK":
                errors.append("حقل note في حدث الربط تم تعديله فعلًا")

        # -- 3) Unlink from the UI → second audit event appended. --
        await input_locator.fill("")
        # button text becomes "إلغاء الربط" when input is empty per implementation
        try:
            unlink_btn = page.get_by_role("button", name="إلغاء الربط", exact=True)
            await unlink_btn.first.click(timeout=3_000)
        except Exception:
            # Fallback: some builds keep the same "ربط" label; try it.
            await link_btn.first.click()
        try:
            await page.wait_for_load_state("networkidle", timeout=8_000)
        except Exception:
            pass
        await page.screenshot(path=str(SCREENSHOTS / "04_after_unlink.png"))

        s, b = _req(
            "GET",
            f"inbox_events?item_id=eq.{item_id}&action=eq.link_appointment"
            "&select=payload_after&order=created_at.asc",
            token,
        )
        events_after = json.loads(b) if s == 200 else []
        if len(events_after) < 2:
            errors.append(
                "لم يُسجَّل حدث link_appointment ثانٍ بعد إلغاء الربط "
                f"(count={len(events_after)}) — الـ audit trail غير مكتمل."
            )
        else:
            last_after = (events_after[-1].get("payload_after") or {}).get(
                "linked_appointment_id", "MISSING"
            )
            if last_after is not None:
                errors.append(
                    f"payload_after بعد إلغاء الربط يجب أن يكون null — got={last_after!r}"
                )
            # first event still says appointment_id (immutable)
            first_after = (events_after[0].get("payload_after") or {}).get(
                "linked_appointment_id"
            )
            if first_after != appointment_id:
                errors.append(
                    "حدث الربط الأول تغيّر بعد إجراء لاحق — الأحداث ليست مناعية"
                )

        # -- Best-effort cleanup: archive the seeded item. --
        _req("PATCH", f"inbox_items?id=eq.{item_id}", token,
             body={"status": "archived"})

        await browser.close()

    if errors:
        for e in errors:
            print(f"[fail] {e}")
        return 1

    print(
        "[ok] link_appointment: linked_appointment_id + status محدَّثان، "
        "وكل خطوة (ربط ثم إلغاء) سُجّلت كحدث inbox_events مناعي."
    )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
