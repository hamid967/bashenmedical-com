"""
Smoke test: /admin sidebar shows expected groups in the new order, and clicking
each top-level module link routes to the correct URL (navigation smoke). Also
hits one drill-down URL per catalog module (branches/specialties/articles/files)
to make sure the $id route matches a real handler and renders without a hard
error boundary.

Session: same resolver as admin_opens_for_admin_user.py.
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

# Expected group order in the new sidebar. Non-super_admin runners won't see
# "منشئ الموقع"; we only assert the ones an admin sees, in order.
EXPECTED_GROUPS_ADMIN = [
    "عام",
    "العمليات اليومية",
    "المرضى والمستخدمون",
    "الطاقم الطبي",
    "الكتالوج",
    "المحتوى والوسائط",
    "الموارد",
    "الذكاء والأدوات",
    "الحوكمة والأمان",
    "المراقبة والأداء",
    "الإعدادات والتكاملات",
]

# Nav links to smoke-test. Every one exists in the new NAV and has a route file.
NAV_SMOKE = [
    "/admin",
    "/admin/inbox",
    "/admin/branches",
    "/admin/specialties",
    "/admin/articles",
    "/admin/files",
    "/admin/settings",
    "/admin/audit-logs",
    "/admin/web-vitals",
]


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


def rpc(path: str, access_token: str) -> list:
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/{path}",
        headers={
            "apikey": SUPA_KEY,
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
    )
    try:
        return json.loads(urllib.request.urlopen(req).read())
    except Exception as e:
        print(f"[warn] rest {path} failed: {e}")
        return []


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


async def main() -> int:
    session, storage_key, access_token, cookies, source = resolve_session()
    if session is None:
        print("[skip] no session available")
        return 0
    uid = session.get("user", {}).get("id")
    if not uid or not has_admin_role(uid, access_token):
        print("[skip] no admin role on current session")
        return 0

    # Pick one real id per drill-down module to prove the $id route resolves.
    drilldowns: list[str] = []
    for name in ("branches", "specialties", "articles", "media_library"):
        rows = rpc(f"{name}?select=id&limit=1", access_token)
        if rows and isinstance(rows, list) and rows and rows[0].get("id"):
            slug = "files" if name == "media_library" else name
            drilldowns.append(f"/admin/{slug}/{rows[0]['id']}")

    print(f"[info] source={source} drilldowns={len(drilldowns)}")

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

        # 1) sidebar group order
        await page.goto(f"{BASE}/admin", wait_until="domcontentloaded")
        try:
            await page.wait_for_selector(".admin-console", timeout=15_000)
        except Exception:
            errors.append("AdminShell (.admin-console) did not render")

        titles = await page.evaluate(
            """() => Array.from(document.querySelectorAll('aside, nav'))
                 .flatMap(n => Array.from(n.querySelectorAll('*')))
                 .map(e => (e.textContent || '').trim())
                 .filter(t => t && t.length < 40)"""
        )
        # Filter to just our expected group titles preserving order.
        seen_order = [t for t in titles if t in EXPECTED_GROUPS_ADMIN]
        # Deduplicate while preserving first occurrence.
        dedup: list[str] = []
        for t in seen_order:
            if t not in dedup:
                dedup.append(t)
        missing = [g for g in EXPECTED_GROUPS_ADMIN if g not in dedup]
        if missing:
            errors.append(f"missing sidebar groups: {missing}")
        # Order check on the intersection
        common = [g for g in EXPECTED_GROUPS_ADMIN if g in dedup]
        if common != [g for g in dedup if g in EXPECTED_GROUPS_ADMIN]:
            errors.append(
                f"sidebar group order mismatch. expected={common} got={dedup}"
            )

        # 2) navigation smoke
        for path in NAV_SMOKE:
            resp = await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
            status = resp.status if resp else 0
            final = await page.evaluate("window.location.pathname")
            if status >= 500:
                errors.append(f"{path} → HTTP {status}")
            if not final.startswith(path.rstrip("/") or "/admin"):
                errors.append(f"{path} redirected to {final}")
            body_text = await page.evaluate("document.body.innerText")
            if "لا تملك صلاحية" in body_text:
                errors.append(f"{path} showed forbidden screen")

        # 3) drill-down smoke
        for path in drilldowns:
            resp = await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
            status = resp.status if resp else 0
            final = await page.evaluate("window.location.pathname")
            body_text = await page.evaluate("document.body.innerText")
            if status >= 500:
                errors.append(f"drill-down {path} → HTTP {status}")
            if final == "/404" or "Not Found" in body_text or "غير موجود" in body_text:
                errors.append(f"drill-down {path} ended on not-found ({final})")

        await browser.close()

    if errors:
        for e in errors:
            print(f"[fail] {e}")
        return 1
    print("[ok] admin sidebar order + navigation + drill-downs OK")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
