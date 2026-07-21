"""
Post-A2: admin يفتح /admin/inbox و /admin/audit-logs و /admin/role-permissions-matrix
دون أي permission denied — هذه الصفحات تستدعي 21+ دالة G3.
"""
import asyncio, os, sys
from playwright.async_api import async_playwright
from _shared import (
    BASE, PermDeniedProbe, make_recording_context, retry_async,
    finalize_context, sign_in_via_supabase,
)

PATHS = [
    "/admin/inbox",
    "/admin/audit-logs",
    "/admin/role-permissions-matrix",
]


async def main():
    email = os.environ.get("E2E_ADMIN_EMAIL")
    pw_ = os.environ.get("E2E_ADMIN_PASSWORD")
    supa_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    anon = os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY") or os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    if not (email and pw_ and supa_url and anon):
        print("[skip] بيانات admin E2E غير مهيّأة")
        sys.exit(0)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx, art = await make_recording_context(browser, name="post-a2-admin")
        page = await ctx.new_page()
        probe = PermDeniedProbe(); probe.attach(page)
        try:
            await sign_in_via_supabase(page, email, pw_, anon, supa_url)
            for path in PATHS:
                await retry_async(lambda p=path: page.goto(f"{BASE}{p}", wait_until="networkidle"))
                await page.wait_for_selector("main", timeout=12000)
                await page.wait_for_timeout(700)  # مهلة لجلب الـfacets
            probe.assert_clean()
            await finalize_context(ctx, art, page, ok=True)
        except Exception:
            await finalize_context(ctx, art, page, ok=False); raise
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
