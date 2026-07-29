"""E2E: header + footer active-state on /team and /team/leadership.

Verifies the unified nav-active logic renders the correct active className
- Header /team link (featured) uses jazan-gold background classes when active.
- Footer /team link uses the underline active class when active.
- Both remain active on the sub-route /team/leadership (prefix match).
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

SCREENSHOTS = Path(__file__).parent / "screenshots" / "team_active"
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

BASE = "http://localhost:8080"


async def get_link_class(page, selector: str) -> str:
    return await page.evaluate(
        "(sel) => { const el = document.querySelector(sel); return el ? el.className : ''; }",
        selector,
    )


async def assert_team_active(page, path: str):
    await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
    await page.wait_for_selector('a[href="/team"]')
    await page.screenshot(path=str(SCREENSHOTS / f"{path.strip('/').replace('/', '_') or 'root'}.png"))

    # There are multiple /team links (header + footer). Grab all of them.
    links = await page.evaluate(
        """() => Array.from(document.querySelectorAll('a[href="/team"]')).map(a => ({
             className: a.className,
             dataStatus: a.getAttribute('data-status'),
             inHeader: !!a.closest('header'),
             inFooter: !!a.closest('footer'),
           }))"""
    )
    assert links, f"no /team links found on {path}"

    header_links = [l for l in links if l["inHeader"]]
    footer_links = [l for l in links if l["inFooter"]]
    assert header_links, f"header /team link missing on {path}"
    assert footer_links, f"footer /team link missing on {path}"

    for l in header_links + footer_links:
        assert l["dataStatus"] == "active", (
            f"expected data-status=active on {path} but got {l['dataStatus']} "
            f"(header={l['inHeader']}, footer={l['inFooter']})"
        )

    # Header uses the "featured" jazan-gold active class.
    for l in header_links:
        assert "jazan-gold" in l["className"], (
            f"header /team on {path} missing featured gold active class: {l['className']}"
        )

    # Footer uses the underline active class.
    for l in footer_links:
        cls = l["className"]
        assert "underline" in cls and "decoration" in cls, (
            f"footer /team on {path} missing underline active class: {cls}"
        )

    print(f"OK {path}: header+footer /team link is active")


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        # Verify active state across the /team root and all known sub-routes.
        # Prefix matching must keep header + footer /team links active on every one.
        sub_paths = [
            "/team",
            "/team/leadership",
            "/team/about",
        ]
        for path in sub_paths:
            await assert_team_active(page, path)

        # Sanity: on an unrelated route, the /team link must NOT be active.
        await page.goto(f"{BASE}/about", wait_until="domcontentloaded")
        await page.wait_for_selector('a[href="/team"]')
        states = await page.evaluate(
            "() => Array.from(document.querySelectorAll('a[href=\"/team\"]')).map(a => a.getAttribute('data-status'))"
        )
        assert all(s != "active" for s in states), (
            f"/team link wrongly active on /about: {states}"
        )
        print("OK /about: /team link is NOT active")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
