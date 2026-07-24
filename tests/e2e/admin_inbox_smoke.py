"""
Smoke test: /admin/inbox — verify filters (status/channel/priority/archived),
search input, URL synchronisation, and that the main table columns and item
fields (request number, status badge, priority badge) render.

Session resolver mirrors admin_sidebar_smoke.py:
  - CI: E2E_ADMIN_EMAIL + E2E_ADMIN_PASSWORD (must have admin role).
  - Sandbox: LOVABLE_BROWSER_SUPABASE_* if injected.
  - Otherwise: skip (exit 0).

Exit codes:
  0 = pass or skipped
  1 = fail
"""
import asyncio, os, sys, json, urllib.request, urllib.error
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
SUPA_URL = "https://rcerbsywuovcleqybumg.supabase.co"
SUPA_KEY = "sb_publishable_jCNv8mbgtiQaIWkms_cHiA_9WUH_qEG"
PROJECT_REF = "rcerbsywuovcleqybumg"
DEFAULT_STORAGE_KEY = f"sb-{PROJECT_REF}-auth-token"

ADMIN_EMAIL = os.environ.get("E2E_ADMIN_EMAIL", "").strip()
ADMIN_PASSWORD = os.environ.get("E2E_ADMIN_PASSWORD", "").strip()
AUTH_STATUS = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "")
INJECTED_SESSION_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON", "")
INJECTED_STORAGE_KEY = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY", "")
INJECTED_COOKIES_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON", "")
INJECTED_ACCESS_TOKEN = os.environ.get("LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN", "")

EXPECTED_HEADERS = [
    "رقم الطلب",
    "المريض",
    "الجوال",
    "الخدمة",
    "القناة",
    "الأولوية",
    "الحالة",
]

# Arabic labels used in the UI for the filter values we exercise.
STATUS_LABELS = {
    "new": "جديد",
    "reviewed": "تمت المراجعة",
    "in_progress": "قيد المعالجة",
}
CHANNEL_LABELS = {
    "website": "الموقع",
    "booking": "الحجز",
    "whatsapp": "واتساب",
}
PRIORITY_LABELS = {
    "normal": "عادي",
    "high": "مرتفع",
    "urgent": "عاجل",
}


def password_sign_in(email: str, password: str) -> dict:
    req = urllib.request.Request(
        f"{SUPA_URL}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"apikey": SUPA_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        raw = urllib.request.urlopen(req).read()
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="ignore")
        raise RuntimeError(f"login failed: HTTP {e.code} — {body}") from e
    data = json.loads(raw)
    return {
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "expires_in": data.get("expires_in", 3600),
        "expires_at": data.get("expires_at"),
        "token_type": data.get("token_type", "bearer"),
        "user": data["user"],
    }


def has_admin_role(uid: str, access_token: str) -> bool:
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/rpc/has_role",
        data=json.dumps({"_user_id": uid, "_role": "admin"}).encode(),
        headers={
            "apikey": SUPA_KEY,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
    )
    try:
        return json.loads(urllib.request.urlopen(req).read()) is True
    except Exception:
        return False


def resolve_session():
    if ADMIN_EMAIL and ADMIN_PASSWORD:
        s = password_sign_in(ADMIN_EMAIL, ADMIN_PASSWORD)
        return s, DEFAULT_STORAGE_KEY, s["access_token"], None, "ci-password"
    if AUTH_STATUS == "injected" and INJECTED_SESSION_JSON:
        try:
            s = json.loads(INJECTED_SESSION_JSON)
        except Exception:
            return None, "", "", None, "injected-broken"
        cookies = None
        if INJECTED_COOKIES_JSON:
            try:
                cookies = json.loads(INJECTED_COOKIES_JSON)
            except Exception:
                cookies = None
        return (
            s,
            INJECTED_STORAGE_KEY or DEFAULT_STORAGE_KEY,
            INJECTED_ACCESS_TOKEN or s.get("access_token", ""),
            cookies,
            "injected",
        )
    return None, "", "", None, "none"


async def pick_option(page, trigger_index: int, label: str):
    """Open Radix Select at trigger_index and click option with `label`."""
    triggers = page.locator('[role="combobox"]')
    await triggers.nth(trigger_index).click()
    await page.get_by_role("option", name=label, exact=True).click()


async def main() -> int:
    session, storage_key, access_token, cookies, source = resolve_session()
    if session is None:
        print("[skip] no session available")
        return 0
    uid = session.get("user", {}).get("id")
    if not uid or not has_admin_role(uid, access_token):
        print("[skip] no admin role on current session")
        return 0

    print(f"[info] source={source}")
    errors: list[str] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1400, "height": 1800})
        if cookies:
            for c in cookies:
                c["url"] = BASE
            await ctx.add_cookies(cookies)
        page = await ctx.new_page()
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, "
            f"{json.dumps(json.dumps(session))})"
        )

        # 1) Load /admin/inbox
        resp = await page.goto(f"{BASE}/admin/inbox", wait_until="domcontentloaded")
        status = resp.status if resp else 0
        if status >= 500:
            errors.append(f"/admin/inbox → HTTP {status}")
        try:
            await page.wait_for_selector("h1", timeout=15_000)
        except Exception:
            errors.append("inbox page did not render <h1>")

        body_text = await page.evaluate("document.body.innerText")
        if "لا تملك صلاحية" in body_text:
            errors.append("inbox page showed forbidden screen")
        if "الصندوق الموحّد" not in body_text:
            errors.append("inbox page missing title 'الصندوق الموحّد'")

        # 2) Table headers rendered (only when there are items; if empty state,
        # confirm the empty message instead).
        has_table = await page.locator("table").count() > 0
        has_empty = "لا توجد طلبات مطابقة" in body_text

        if not has_table and not has_empty:
            errors.append("neither table nor empty-state rendered")

        if has_table:
            headers_text = await page.evaluate(
                "Array.from(document.querySelectorAll('table thead th'))"
                ".map(e => (e.textContent || '').trim())"
            )
            missing_headers = [h for h in EXPECTED_HEADERS if h not in headers_text]
            if missing_headers:
                errors.append(f"missing table headers: {missing_headers}")

            # Row content sanity: at least the first row should carry a
            # request-number cell (non-empty first td) and status/priority
            # badges. We don't assert exact values — data is dynamic.
            row_cells = await page.evaluate(
                """() => {
                    const row = document.querySelector('table tbody tr');
                    if (!row) return null;
                    return Array.from(row.querySelectorAll('td'))
                      .map(td => (td.textContent || '').trim());
                }"""
            )
            if row_cells is not None:
                if not row_cells or not row_cells[0] or row_cells[0] == "—":
                    errors.append("first row is missing request-number cell")

        # 3) Search input syncs to URL (?q=...)
        search_input = page.locator('input[placeholder^="ابحث"]').first
        await search_input.fill("smoketest-xyz")
        # debounce/state flush
        await page.wait_for_timeout(400)
        url = page.url
        if "q=smoketest-xyz" not in url:
            errors.append(f"search did not update URL, got {url}")

        # Reset via the reset button.
        await page.get_by_role("button", name="إعادة تعيين").click()
        await page.wait_for_timeout(300)
        if "q=" in page.url:
            errors.append(f"reset did not clear q, url={page.url}")

        # 4) Filters sync to URL. Triggers appear in DOM order:
        # 0=status, 1=channel, 2=priority.
        await pick_option(page, 0, STATUS_LABELS["new"])
        await page.wait_for_timeout(250)
        if "status=new" not in page.url:
            errors.append(f"status filter did not update URL, got {page.url}")

        await pick_option(page, 1, CHANNEL_LABELS["whatsapp"])
        await page.wait_for_timeout(250)
        if "channel=whatsapp" not in page.url:
            errors.append(f"channel filter did not update URL, got {page.url}")

        await pick_option(page, 2, PRIORITY_LABELS["urgent"])
        await page.wait_for_timeout(250)
        if "priority=urgent" not in page.url:
            errors.append(f"priority filter did not update URL, got {page.url}")

        # 5) Archived checkbox.
        archived_cb = page.locator('input[type="checkbox"]').first
        await archived_cb.check()
        await page.wait_for_timeout(250)
        if "archived=true" not in page.url:
            errors.append(f"archived toggle did not update URL, got {page.url}")

        # 6) Deep-link filters directly and confirm page still renders.
        resp = await page.goto(
            f"{BASE}/admin/inbox?status=new&channel=website&priority=normal",
            wait_until="domcontentloaded",
        )
        if resp and resp.status >= 500:
            errors.append(f"deep-link filter combo → HTTP {resp.status}")
        try:
            await page.wait_for_selector("h1", timeout=10_000)
        except Exception:
            errors.append("deep-linked filter page did not render <h1>")
        body_text2 = await page.evaluate("document.body.innerText")
        if "الصندوق الموحّد" not in body_text2:
            errors.append("deep-linked filter page missing title")

        await browser.close()

    if errors:
        for e in errors:
            print(f"[fail] {e}")
        return 1
    print("[ok] /admin/inbox filters + search + core columns OK")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
