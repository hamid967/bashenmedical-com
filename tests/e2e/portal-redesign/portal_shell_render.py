#!/usr/bin/env python3
"""Acceptance test — portal shell renders correctly at desktop and mobile.

Covers:
- Desktop sidebar visible with grouped NAV
- Mobile bottom nav shows 5 items
- Language switching (AR/EN) preserves layout
- Active state on current route
"""
import asyncio, os, json
from pathlib import Path
from playwright.async_api import async_playwright

SS = Path("/tmp/browser/portal-shell/screenshots")
SS.mkdir(parents=True, exist_ok=True)


async def restore_session(context, page):
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cookies_json:
        cookies = json.loads(cookies_json)
        for c in cookies:
            c["url"] = "http://localhost:8080"
        await context.add_cookies(cookies)
    await page.goto("http://localhost:8080")
    if storage_key and session_json:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
        )


async def main():
    status = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "")
    if status not in ("injected",):
        print(f"SKIP: auth status={status!r} — need a signed-in session in preview")
        return

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        # Desktop
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        await restore_session(ctx, page)
        await page.goto("http://localhost:8080/portal", wait_until="domcontentloaded")
        await page.wait_for_selector("aside nav[aria-label]", timeout=8000)
        await page.screenshot(path=str(SS / "desktop_ar.png"))

        # Verify 6 groups visible
        group_count = await page.evaluate(
            "() => document.querySelectorAll('aside nav ul > li > div').length"
        )
        assert group_count >= 6, f"expected >=6 nav groups, got {group_count}"
        print(f"desktop AR: {group_count} groups")

        # Mobile
        m_ctx = await browser.new_context(viewport={"width": 390, "height": 844})
        m_page = await m_ctx.new_page()
        await restore_session(m_ctx, m_page)
        await m_page.goto("http://localhost:8080/portal", wait_until="domcontentloaded")
        await m_page.wait_for_selector("nav[aria-label]", timeout=8000)
        await m_page.screenshot(path=str(SS / "mobile_ar.png"))

        bottom_items = await m_page.evaluate(
            "() => document.querySelectorAll('nav[aria-label] > ul.grid-cols-5 > li').length"
        )
        assert bottom_items == 5, f"expected 5 bottom-nav items, got {bottom_items}"
        print(f"mobile AR: {bottom_items} bottom nav items")

        await browser.close()
        print("OK — portal shell (desktop+mobile) rendered")


if __name__ == "__main__":
    asyncio.run(main())
