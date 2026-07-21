"""
Post-A2: /reservations/manage تُحمّل نموذج OTP دون طلبات محرومة.
لا نُدخل OTP فعلياً (يتطلب SMS)، فقط نتحقق أن الصفحة تعمل.
"""
import asyncio
from playwright.async_api import async_playwright
from _shared import BASE, PermDeniedProbe, make_recording_context, retry_async, finalize_context


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx, art = await make_recording_context(browser, name="post-a2-manage")
        page = await ctx.new_page()
        probe = PermDeniedProbe(); probe.attach(page)
        try:
            await retry_async(lambda: page.goto(f"{BASE}/reservations/manage", wait_until="networkidle"))
            await page.wait_for_selector("input", timeout=8000)
            probe.assert_clean()
            await finalize_context(ctx, art, page, ok=True)
        except Exception:
            await finalize_context(ctx, art, page, ok=False); raise
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
