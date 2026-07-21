"""
Post-A2: /doctors listing + detail قابلة للقراءة عاماً بدون permission denied.
"""
import asyncio
from playwright.async_api import async_playwright
from _shared import BASE, PermDeniedProbe, make_recording_context, retry_async, finalize_context


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx, art = await make_recording_context(browser, name="post-a2-doctors")
        page = await ctx.new_page()
        probe = PermDeniedProbe(); probe.attach(page)
        try:
            await retry_async(lambda: page.goto(f"{BASE}/doctors", wait_until="networkidle"))
            await page.wait_for_selector("h1", timeout=8000)
            # نقر أول كرت طبيب إن وُجد
            first = page.locator("a[href^='/doctors/']").first
            if await first.count() > 0:
                href = await first.get_attribute("href")
                await retry_async(lambda: page.goto(f"{BASE}{href}", wait_until="networkidle"))
                await page.wait_for_selector("h1", timeout=8000)
            probe.assert_clean()
            await finalize_context(ctx, art, page, ok=True)
        except Exception:
            await finalize_context(ctx, art, page, ok=False); raise
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
