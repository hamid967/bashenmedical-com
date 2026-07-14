"""
E2E: /admin يفتح مباشرة (بدون redirect) لمستخدم يملك دور admin

يستعيد جلسة Supabase المُحقنة، يتأكد أن المستخدم يملك دور admin عبر
RPC has_role، ثم يفتح /admin كـ deep link ويتحقّق:
  1) الصفحة النهائية ما زالت على "/admin".
  2) عنصر AdminShell (.admin-console) ظاهر.
  3) لا رسالة "لا تملك صلاحية".

إذا لم يكن المستخدم الحالي أدمن، يُخطَّى الاختبار برسالة واضحة (لأننا
لا نستطيع منح دور admin من العميل — RLS تمنع ذلك). في بيئة CI يجب تزويد
جلسة لمستخدم أدمن للحصول على تغطية إيجابية فعلية.

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


def has_admin_role(uid: str) -> bool:
    if not ACCESS_TOKEN:
        return False
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/rpc/has_role",
        data=json.dumps({"_user_id": uid, "_role": "admin"}).encode(),
        headers={
            "apikey": SUPA_KEY,
            "Authorization": f"Bearer {ACCESS_TOKEN}",
            "Content-Type": "application/json",
        },
    )
    try:
        return json.loads(urllib.request.urlopen(req).read()) is True
    except Exception as e:
        print(f"[warn] has_role(admin) فشل: {e}")
        return False


async def main() -> int:
    if AUTH_STATUS != "injected":
        print(f"[skip] LOVABLE_BROWSER_AUTH_STATUS={AUTH_STATUS!r} — لا توجد جلسة.")
        return 0
    uid = user_id_from_session()
    if not uid:
        print("[skip] لا يمكن قراءة user_id من الجلسة.")
        return 0
    if not has_admin_role(uid):
        print(
            f"[skip] المستخدم {uid} لا يملك دور admin — هذا اختبار إيجابي "
            "ويتطلب جلسة أدمن. زوّد CI بجلسة مستخدم أدمن لتفعيله."
        )
        return 0

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})

        if COOKIES_JSON:
            cookies = json.loads(COOKIES_JSON)
            for c in cookies:
                c["url"] = BASE
            await ctx.add_cookies(cookies)

        page = await ctx.new_page()
        await page.goto(BASE, wait_until="domcontentloaded")
        if STORAGE_KEY and SESSION_JSON:
            await page.evaluate(
                f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(SESSION_JSON)})"
            )

        # deep link مباشر لـ /admin
        await page.goto(f"{BASE}/admin", wait_until="domcontentloaded")

        # انتظار تحميل AdminShell (حتى 10s) — قد يحتاج vqن load بعد ensureQueryData
        try:
            await page.wait_for_selector(".admin-console", timeout=10_000)
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

        print(f"[ok] /admin فُتحت مباشرة على {final_path} لأدمن بدون توجيه.")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
