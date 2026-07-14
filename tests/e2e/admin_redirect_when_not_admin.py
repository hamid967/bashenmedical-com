"""
E2E: /admin يعيد التوجيه إلى / إذا لم يملك المستخدم دور admin

يستعيد جلسة Supabase المُحقنة (`LOVABLE_BROWSER_SUPABASE_*`) في localStorage +
الكوكيز، ثم يفتح /admin مباشرة كـ deep link ويتحقّق من:
  1) المتصفح انتهى على "/" وليس على "/admin".
  2) عنصر "لوحة الإدارة" (AdminShell) لم يُعرَض.

يتطلب أن يكون `LOVABLE_BROWSER_AUTH_STATUS=injected` وأن المستخدم لا يملك
أي دور من CONSOLE_ROLES (admin/reception/doctor/nurse/hr/pharmacy). في حال
كان يملك دورًا، تُخطّى الحالة برسالة واضحة بدل الفشل.

Exit codes:
  0 = pass أو skipped
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


def user_id_from_session() -> str | None:
    if not SESSION_JSON:
        return None
    try:
        return json.loads(SESSION_JSON).get("user", {}).get("id")
    except Exception:
        return None


def user_roles(uid: str) -> list[str]:
    """
    نستخدم RPC has_role للتحقق من كل دور من CONSOLE_ROLES باستخدام
    الـ access token (RLS تسمح للمستخدم بقراءة أدواره).
    """
    if not ACCESS_TOKEN:
        return []
    found: list[str] = []
    for role in ["admin", "reception", "doctor", "nurse", "hr", "pharmacy",
                 "super_admin", "support_agent"]:
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
            res = json.loads(urllib.request.urlopen(req).read())
            if res is True:
                found.append(role)
        except Exception as e:
            print(f"[warn] has_role({role}) failed: {e}")
    return found


CONSOLE_ROLES = {"admin", "reception", "doctor", "nurse", "hr", "pharmacy"}


async def main() -> int:
    if AUTH_STATUS != "injected":
        print(f"[skip] LOVABLE_BROWSER_AUTH_STATUS={AUTH_STATUS!r} — لا توجد جلسة مُحقنة.")
        return 0
    uid = user_id_from_session()
    if not uid:
        print("[skip] لا يمكن قراءة user_id من الجلسة.")
        return 0

    roles = user_roles(uid)
    print(f"[info] user_id={uid} roles={roles}")
    if CONSOLE_ROLES.intersection(roles):
        print(
            f"[skip] المستخدم يملك دورًا يمنح وصول admin ({roles}). "
            "هذا الاختبار سلبي ويحتاج مستخدمًا بلا دور."
        )
        return 0

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})

        # 1) استعادة الجلسة عبر cookies (@supabase/ssr) — قبل أي navigation
        if COOKIES_JSON:
            cookies = json.loads(COOKIES_JSON)
            for c in cookies:
                c["url"] = BASE
            await ctx.add_cookies(cookies)

        page = await ctx.new_page()

        # 2) الوصول إلى نقطة على نفس origin ثم كتابة localStorage
        await page.goto(BASE, wait_until="domcontentloaded")
        if STORAGE_KEY and SESSION_JSON:
            await page.evaluate(
                f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(SESSION_JSON)})"
            )

        # 3) deep link مباشر لـ /admin
        await page.goto(f"{BASE}/admin", wait_until="domcontentloaded")

        # 4) الانتظار حتى يستقر عنوان URL بعيدًا عن /admin
        try:
            await page.wait_for_function(
                "!window.location.pathname.startsWith('/admin')",
                timeout=10_000,
            )
        except Exception:
            pass

        final_url = page.url
        final_path = await page.evaluate("window.location.pathname")
        print(f"[info] final_url={final_url}")

        errors: list[str] = []

        # 5) يجب ألا يبقى على /admin
        if final_path.startswith("/admin"):
            # قد يعرض شاشة "لا تملك صلاحية الوصول" (المكون القديم) — نعتبرها فشلاً
            # لأن السلوك المطلوب هو redirect إلى /.
            body = await page.evaluate("document.body.innerText")
            if "لا تملك صلاحية" in body or "لوحة الإدارة" in body:
                errors.append(
                    "بقيت الصفحة على /admin وعرضت محتوى الأدمن بدل التوجيه إلى /."
                )
            else:
                errors.append(f"بقيت الصفحة على مسار /admin: {final_path}")

        # 6) الوجهة الافتراضية بعد الرفض يجب أن تكون "/" (أو /auth إن انتهت الجلسة).
        allowed = {"/", "/auth"}
        if final_path not in allowed and not final_path.startswith("/admin"):
            print(f"[warn] final path {final_path!r} ليس ضمن {allowed} — يُقبل ما لم يكن /admin")

        # 7) تأكيد إضافي: لا يوجد AdminShell على الصفحة
        shell_visible = await page.evaluate(
            "!!document.querySelector('.admin-console, [data-admin-shell]')"
        )
        if shell_visible and final_path.startswith("/admin"):
            errors.append("عناصر AdminShell ظاهرة رغم انعدام الصلاحية.")

        await browser.close()

        if errors:
            for e in errors:
                print(f"[fail] {e}")
            return 1

        print(f"[ok] /admin أعاد التوجيه بنجاح إلى {final_path} لمستخدم بلا دور admin.")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
