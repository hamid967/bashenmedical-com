"""
E2E: /admin يفتح مباشرة (بدون redirect إلى /portal) لمستخدم يملك دور super_admin.

مصدر الجلسة (بالترتيب):
  1) E2E_SUPER_ADMIN_EMAIL + E2E_SUPER_ADMIN_PASSWORD (المسار الرسمي في CI)
  2) وإلا: E2E_ADMIN_EMAIL/PASSWORD إن كان المستخدم يملك دور super_admin
  3) وإلا: الجلسة المُحقنة LOVABLE_BROWSER_SUPABASE_* إن كان صاحبها super_admin
  4) وإلا → skip

ثم يفتح /admin كـ deep link ويتحقّق:
  - المسار النهائي ما زال /admin (لا توجيه إلى /portal).
  - AdminShell (.admin-console) ظاهر.
  - لا نص "لا تملك صلاحية".

Exit codes: 0 = pass/skip, 1 = fail
"""
import asyncio, os, sys, json, urllib.request, urllib.error
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
SUPA_URL = "https://rcerbsywuovcleqybumg.supabase.co"
SUPA_KEY = "sb_publishable_jCNv8mbgtiQaIWkms_cHiA_9WUH_qEG"
PROJECT_REF = "rcerbsywuovcleqybumg"
DEFAULT_STORAGE_KEY = f"sb-{PROJECT_REF}-auth-token"

SUPER_EMAIL = os.environ.get("E2E_SUPER_ADMIN_EMAIL", "").strip()
SUPER_PASSWORD = os.environ.get("E2E_SUPER_ADMIN_PASSWORD", "").strip()
FALLBACK_EMAIL = os.environ.get("E2E_ADMIN_EMAIL", "").strip()
FALLBACK_PASSWORD = os.environ.get("E2E_ADMIN_PASSWORD", "").strip()

AUTH_STATUS = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "")
INJECTED_SESSION_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON", "")
INJECTED_STORAGE_KEY = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY", "")
INJECTED_COOKIES_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON", "")
INJECTED_ACCESS_TOKEN = os.environ.get("LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN", "")


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
        raise RuntimeError(
            f"فشل تسجيل الدخول لـ {email!r}: HTTP {e.code} — {body}"
        ) from e
    data = json.loads(raw)
    return {
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "expires_in": data.get("expires_in", 3600),
        "expires_at": data.get("expires_at"),
        "token_type": data.get("token_type", "bearer"),
        "user": data["user"],
    }


def has_role(uid: str, role: str, access_token: str) -> bool:
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/rpc/has_role",
        data=json.dumps({"_user_id": uid, "_role": role}).encode(),
        headers={
            "apikey": SUPA_KEY,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
    )
    try:
        return json.loads(urllib.request.urlopen(req).read()) is True
    except Exception as e:
        print(f"[warn] has_role({role}) فشل: {e}")
        return False


def resolve_session():
    """→ (session, storage_key, access_token, cookies, source_label)"""
    if SUPER_EMAIL and SUPER_PASSWORD:
        s = password_sign_in(SUPER_EMAIL, SUPER_PASSWORD)
        return s, DEFAULT_STORAGE_KEY, s["access_token"], None, "ci-super-password"

    if FALLBACK_EMAIL and FALLBACK_PASSWORD:
        s = password_sign_in(FALLBACK_EMAIL, FALLBACK_PASSWORD)
        return s, DEFAULT_STORAGE_KEY, s["access_token"], None, "ci-admin-password"

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
        print(
            "[skip] لا توجد جلسة. زوّد E2E_SUPER_ADMIN_EMAIL/PASSWORD "
            "(أو E2E_ADMIN_EMAIL/PASSWORD لمستخدم super_admin) لتفعيل الاختبار."
        )
        return 0

    uid = session.get("user", {}).get("id")
    if not uid:
        print("[skip] الجلسة لا تحوي user.id.")
        return 0

    if not has_role(uid, "super_admin", access_token):
        if source.startswith("ci-"):
            print(
                f"[fail] المستخدم لا يملك دور super_admin في user_roles "
                f"(source={source}). أضِف الدور قبل تشغيل الاختبار."
            )
            return 1
        print(f"[skip] الجلسة المُحقنة لمستخدم {uid} بلا دور super_admin.")
        return 0

    print(f"[info] source={source} user_id={uid}")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})

        if cookies:
            for c in cookies:
                c["url"] = BASE
            await ctx.add_cookies(cookies)

        page = await ctx.new_page()
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(json.dumps(session))})"
        )

        await page.goto(f"{BASE}/admin", wait_until="domcontentloaded")
        try:
            await page.wait_for_selector(".admin-console", timeout=15_000)
        except Exception:
            pass

        final_path = await page.evaluate("window.location.pathname")
        shell_visible = await page.evaluate("!!document.querySelector('.admin-console')")
        body_text = await page.evaluate("document.body.innerText")

        print(f"[info] final_path={final_path} shell_visible={shell_visible}")

        errors: list[str] = []
        if final_path.startswith("/portal"):
            errors.append("تم توجيه super_admin إلى /portal (متوقّع: البقاء على /admin).")
        if not final_path.startswith("/admin"):
            errors.append(f"توجيه غير متوقّع إلى {final_path} رغم دور super_admin.")
        if not shell_visible:
            errors.append("لم يُعرض AdminShell (.admin-console) لـ super_admin.")
        if "لا تملك صلاحية" in body_text:
            errors.append("عُرضت شاشة انعدام الصلاحية رغم دور super_admin.")

        await browser.close()

        if errors:
            for e in errors:
                print(f"[fail] {e}")
            return 1

        print(f"[ok] /admin فُتحت مباشرة على {final_path} لـ super_admin (source={source}).")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
