"""
Post-A2: مريض مسجّل يفتح /portal/appointments و /portal/records بدون permission denied.
يستخدم E2E_PATIENT_EMAIL/PASSWORD.
"""
import asyncio, os, sys
from playwright.async_api import async_playwright
from _shared import (
    BASE, PermDeniedProbe, make_recording_context, retry_async,
    finalize_context, sign_in_via_supabase,
)


async def main():
    email = os.environ.get("E2E_PATIENT_EMAIL")
    pw_ = os.environ.get("E2E_PATIENT_PASSWORD")
    supa_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    anon = os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY") or os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    if not (email and pw_ and supa_url and anon):
        print("[skip] بيانات مريض E2E غير مهيّأة")
        sys.exit(0)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx, art = await make_recording_context(browser, name="post-a2-portal")
        page = await ctx.new_page()
        probe = PermDeniedProbe(); probe.attach(page)
        try:
            await sign_in_via_supabase(page, email, pw_, anon, supa_url)
            for path in ("/portal/appointments", "/portal/records"):
                await retry_async(lambda p=path: page.goto(f"{BASE}{p}", wait_until="networkidle"))
                await page.wait_for_selector("main", timeout=10000)
            probe.assert_clean()
            await finalize_context(ctx, art, page, ok=True)
        except Exception:
            await finalize_context(ctx, art, page, ok=False); raise
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
