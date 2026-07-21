"""
Post-A2: صفحة /book تُحمّل بنجاح وتستدعي دوال slot دون permission denied.
لا تُنفّذ تأكيداً نهائياً (يتطلّب OTP)، يكفي التأكد من عمل خطوات الاختيار.
"""
import asyncio
from playwright.async_api import async_playwright
from _shared import BASE, PermDeniedProbe, make_recording_context, retry_async, finalize_context


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx, art = await make_recording_context(browser, name="post-a2-book")
        page = await ctx.new_page()
        probe = PermDeniedProbe(); probe.attach(page)
        try:
            await retry_async(lambda: page.goto(f"{BASE}/book", wait_until="networkidle"))
            await page.wait_for_selector("main", timeout=8000)
            # زيارة نسخة EN كذلك للتأكد من عدم كسر i18n
            await retry_async(lambda: page.goto(f"{BASE}/en/book", wait_until="domcontentloaded"))
            await page.wait_for_timeout(500)
            probe.assert_clean()
            await finalize_context(ctx, art, page, ok=True)
        except Exception:
            await finalize_context(ctx, art, page, ok=False); raise
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
