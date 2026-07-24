"""
Smoke test: non-admin users cannot reach any /admin/* route and never see
the AdminShell sidebar links.

Behaviour:
  1) Restore an injected Supabase session (LOVABLE_BROWSER_SUPABASE_*).
  2) Confirm the session user has NO console role (admin/super_admin/…);
     otherwise skip (this is a negative test).
  3) For each protected /admin path, deep-link and confirm:
       - final pathname does not start with /admin
       - `.admin-console` / `[data-admin-shell]` are not in the DOM
       - no sidebar link with `href^="/admin"` is rendered
       - the "لا تملك صلاحية" screen is NOT shown (we require redirect,
         not a forbidden screen inside the shell).

Exit codes:
  0 = pass or skipped
  1 = fail
"""
import asyncio, os, sys, json, urllib.request
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
SUPA_URL = "https://rcerbsywuovcleqybumg.supabase.co"
SUPA_KEY = "sb_publishable_jCNv8mbgtiQaIWkms_cHiA_9WUH_qEG"

AUTH_STATUS = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "")
SESSION_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON", "")
STORAGE_KEY = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY", "")
COOKIES_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON", "")
ACCESS_TOKEN = os.environ.get("LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN", "")

CONSOLE_ROLES = [
    "admin", "super_admin", "reception", "doctor",
    "nurse", "hr", "pharmacy", "support_agent",
]

# Deep-link probes across the whole console surface.
PROBES = [
    "/admin",
    "/admin/inbox",
    "/admin/branches",
    "/admin/specialties",
    "/admin/articles",
    "/admin/files",
    "/admin/settings",
    "/admin/audit-logs",
    "/admin/web-vitals",
    "/admin/doctors",
]


def user_id_from_session() -> str | None:
    if not SESSION_JSON:
        return None
    try:
        return json.loads(SESSION_JSON).get("user", {}).get("id")
    except Exception:
        return None


def user_roles(uid: str) -> list[str]:
    if not ACCESS_TOKEN:
        return []
    found: list[str] = []
    for role in CONSOLE_ROLES:
        req = urllib.request.Request(
            f"{SUPA_URL}/rest/v1/rpc/has_role",
            data=json.dumps({"_user_id": uid, "_role": role}).encode(),
            headers={
                "apikey": SUPA_KEY,
                "Authorization": f"Bearer {ACCESS_TOKEN}",
                "Content-Type": "application/json",
            },
        )
        try:
            if json.loads(urllib.request.urlopen(req).read()) is True:
                found.append(role)
        except Exception as e:
            print(f"[warn] has_role({role}) failed: {e}")
    return found


async def main() -> int:
    if AUTH_STATUS != "injected":
        print(f"[skip] LOVABLE_BROWSER_AUTH_STATUS={AUTH_STATUS!r}")
        return 0
    uid = user_id_from_session()
    if not uid:
        print("[skip] cannot read user_id from session")
        return 0

    roles = user_roles(uid)
    print(f"[info] user_id={uid} roles={roles}")
    if roles:
        print(f"[skip] session user has console role(s) {roles} — negative test needs a non-admin user")
        return 0

    errors: list[str] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})

        if COOKIES_JSON:
            try:
                cookies = json.loads(COOKIES_JSON)
                for c in cookies:
                    c["url"] = BASE
                await ctx.add_cookies(cookies)
            except Exception as e:
                print(f"[warn] cookie restore failed: {e}")

        page = await ctx.new_page()
        await page.goto(BASE, wait_until="domcontentloaded")
        if STORAGE_KEY and SESSION_JSON:
            await page.evaluate(
                f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(SESSION_JSON)})"
            )

        for path in PROBES:
            await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
            # Give the router time to run beforeLoad → redirect.
            try:
                await page.wait_for_function(
                    "!window.location.pathname.startsWith('/admin')",
                    timeout=8_000,
                )
            except Exception:
                pass

            final_path = await page.evaluate("window.location.pathname")
            body_text = await page.evaluate("document.body.innerText")

            if final_path.startswith("/admin"):
                errors.append(f"{path} did not redirect (final={final_path})")
                if "لا تملك صلاحية" in body_text:
                    errors.append(
                        f"{path} showed forbidden screen instead of redirecting"
                    )

            shell_visible = await page.evaluate(
                "!!document.querySelector('.admin-console, [data-admin-shell]')"
            )
            if shell_visible:
                errors.append(f"{path} rendered AdminShell for non-admin user")

            sidebar_links = await page.evaluate(
                """Array.from(document.querySelectorAll('aside a[href^="/admin"], nav a[href^="/admin"]'))
                     .map(a => a.getAttribute('href'))"""
            )
            if sidebar_links:
                errors.append(f"{path} exposed sidebar admin links: {sidebar_links[:5]}")

        await browser.close()

    if errors:
        for e in errors:
            print(f"[fail] {e}")
        return 1
    print(f"[ok] non-admin blocked from {len(PROBES)} /admin paths; no sidebar leakage")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
