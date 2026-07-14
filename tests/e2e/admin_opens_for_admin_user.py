"""
E2E: /admin يفتح مباشرة (بدون redirect) لمستخدم يملك دور admin

مصدر الجلسة (بالترتيب):
  1) إذا وُجدت E2E_ADMIN_EMAIL + E2E_ADMIN_PASSWORD (متغيرات CI ثابتة)
     → تسجيل دخول مباشر عبر Supabase Auth REST
     (`/auth/v1/token?grant_type=password`) وبناء جلسة كاملة.
     هذا هو المسار الرسمي لـ CI وتشغيل هذا الاختبار بدون skip.
  2) وإلا: الاعتماد على الجلسة المُحقنة `LOVABLE_BROWSER_SUPABASE_*`.
  3) إن لم يتوفّر أيّ منهما — أو كان المستخدم بلا دور admin — يُخطَّى الاختبار.

ثم يفتح /admin كـ deep link ويتحقّق:
  1) الصفحة النهائية ما زالت على "/admin".
  2) عنصر AdminShell (.admin-console) ظاهر.
  3) لا رسالة "لا تملك صلاحية".

تجهيز CI لتفعيل الاختبار كإيجابي دائم:
  - أنشئ (أو استخدم) مستخدمًا مخصّصًا للاختبارات يملك دور admin في
    جدول user_roles.
  - أضِف في إعدادات CI (متغيرات بيئة الـ runner) السرّين:
        E2E_ADMIN_EMAIL      = admin-e2e@example.com
        E2E_ADMIN_PASSWORD   = <كلمة سر قوية>
  - لا تُخزَّن هذه القيم داخل المستودع أو داخل .env مُلتزَم.

Exit codes:
  0 = pass أو skipped
  1 = fail
"""
import asyncio, os, sys, json, urllib.request, urllib.error
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
SUPA_URL = "https://rcerbsywuovcleqybumg.supabase.co"
SUPA_KEY = "sb_publishable_jCNv8mbgtiQaIWkms_cHiA_9WUH_qEG"
PROJECT_REF = "rcerbsywuovcleqybumg"
DEFAULT_STORAGE_KEY = f"sb-{PROJECT_REF}-auth-token"

# مصدر ثابت لـ CI
ADMIN_EMAIL = os.environ.get("E2E_ADMIN_EMAIL", "").strip()
ADMIN_PASSWORD = os.environ.get("E2E_ADMIN_PASSWORD", "").strip()

# fallback: الجلسة المُحقنة داخل السَّندبوكس
AUTH_STATUS = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "")
INJECTED_SESSION_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON", "")
INJECTED_STORAGE_KEY = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY", "")
INJECTED_COOKIES_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON", "")
INJECTED_ACCESS_TOKEN = os.environ.get("LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN", "")


def password_sign_in(email: str, password: str) -> dict:
    """يعيد كائن session بصيغة متوافقة مع Supabase JS (localStorage)."""
    req = urllib.request.Request(
        f"{SUPA_URL}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={
            "apikey": SUPA_KEY,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        raw = urllib.request.urlopen(req).read()
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="ignore")
        raise RuntimeError(
            f"فشل تسجيل الدخول لـ E2E_ADMIN_EMAIL={email!r}: HTTP {e.code} — {body}"
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
    except Exception as e:
        print(f"[warn] has_role(admin) فشل: {e}")
        return False


def resolve_session() -> tuple[dict | None, str, str, list | None, str]:
    """
    → (session_dict, storage_key, access_token, cookies, source_label)
    """
    if ADMIN_EMAIL and ADMIN_PASSWORD:
        session = password_sign_in(ADMIN_EMAIL, ADMIN_PASSWORD)
        return session, DEFAULT_STORAGE_KEY, session["access_token"], None, "ci-password"

    if AUTH_STATUS == "injected" and INJECTED_SESSION_JSON:
        try:
            session = json.loads(INJECTED_SESSION_JSON)
        except Exception:
            return None, "", "", None, "injected-broken"
        cookies = None
        if INJECTED_COOKIES_JSON:
            try:
                cookies = json.loads(INJECTED_COOKIES_JSON)
            except Exception:
                cookies = None
        return (
            session,
            INJECTED_STORAGE_KEY or DEFAULT_STORAGE_KEY,
            INJECTED_ACCESS_TOKEN or session.get("access_token", ""),
            cookies,
            "injected",
        )

    return None, "", "", None, "none"


async def main() -> int:
    session, storage_key, access_token, cookies, source = resolve_session()
    if session is None:
        print(
            "[skip] لا توجد جلسة. زوّد E2E_ADMIN_EMAIL و E2E_ADMIN_PASSWORD "
            "في متغيرات بيئة CI لتفعيل الاختبار كإيجابي دائم."
        )
        return 0

    uid = session.get("user", {}).get("id")
    if not uid:
        print("[skip] الجلسة لا تحوي user.id.")
        return 0

    if not has_admin_role(uid, access_token):
        if source == "ci-password":
            print(
                f"[fail] المستخدم {ADMIN_EMAIL!r} لا يملك دور admin في جدول user_roles. "
                "أضِف الدور قبل تشغيل الاختبار في CI."
            )
            return 1
        print(
            f"[skip] الجلسة المُحقنة لمستخدم {uid} بلا دور admin. "
            "استخدم E2E_ADMIN_EMAIL/PASSWORD لجلسة أدمن ثابتة في CI."
        )
        return 0

    print(f"[info] source={source} user_id={uid} storage_key={storage_key}")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})

        # كوكيز @supabase/ssr — تُستخدم فقط للجلسة المُحقنة
        if cookies:
            for c in cookies:
                c["url"] = BASE
            await ctx.add_cookies(cookies)

        page = await ctx.new_page()
        await page.goto(BASE, wait_until="domcontentloaded")

        # اكتب الجلسة في localStorage (المسار الذي يقرأه Supabase JS)
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(json.dumps(session))})"
        )

        # deep link مباشر لـ /admin
        await page.goto(f"{BASE}/admin", wait_until="domcontentloaded")
        try:
            await page.wait_for_selector(".admin-console", timeout=15_000)
        except Exception:
            pass

        final_path = await page.evaluate("window.location.pathname")
        shell_visible = await page.evaluate(
            "!!document.querySelector('.admin-console')"
        )
        body_text = await page.evaluate("document.body.innerText")

        print(f"[info] final_path={final_path} shell_visible={shell_visible}")

        errors: list[str] = []
        if not final_path.startswith("/admin"):
            errors.append(f"حصل توجيه غير متوقّع إلى {final_path} رغم امتلاك دور admin.")
        if not shell_visible:
            errors.append("لم يُعرض AdminShell (.admin-console) رغم امتلاك دور admin.")
        if "لا تملك صلاحية" in body_text:
            errors.append("عُرضت شاشة انعدام الصلاحية رغم امتلاك دور admin.")

        await browser.close()

        if errors:
            for e in errors:
                print(f"[fail] {e}")
            return 1

        print(f"[ok] /admin فُتحت مباشرة على {final_path} لأدمن بدون توجيه (source={source}).")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
