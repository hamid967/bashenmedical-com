"""
BranchBookingForm render E2E — navigates to /branches, opens the first
branch's page, and verifies the embedded BranchBookingForm renders with
its Arabic heading ("احجز موعد ...") and step nav.

Non-destructive: does not submit a booking.

Env:
  E2E_BASE_URL   default http://localhost:8080
  E2E_ARTIFACTS  default ./e2e-artifacts
"""
import asyncio, os, re, sys, traceback
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
ART = Path(os.environ.get("E2E_ARTIFACTS", "e2e-artifacts")).resolve()
SHOTS = ART / "screenshots" / "book-branch-form"
SHOTS.mkdir(parents=True, exist_ok=True)


async def run():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800}, locale="ar-SA")
        page = await context.new_page()
        try:
            await page.goto(f"{BASE}/branches", wait_until="domcontentloaded")
            await page.wait_for_load_state("networkidle", timeout=15000)
            await page.wait_for_timeout(800)
            await page.screenshot(path=str(SHOTS / "01_branches_list.png"))

            # First anchor to a branch detail page.
            branch_link = page.locator('a[href^="/branches/"]:not([href="/branches"])').first
            if await branch_link.count() == 0:
                raise AssertionError("no branch detail link found on /branches")
            await branch_link.click()
            await page.wait_for_url(re.compile(r"/branches/[^/]+"))
            await page.wait_for_load_state("networkidle", timeout=15000)
            await page.wait_for_timeout(1000)
            await page.screenshot(path=str(SHOTS / "02_branch_page.png"))

            # Ensure the BranchBookingForm heading is present (contains "احجز موعد").
            heading = page.locator('h3', has_text=re.compile(r"احجز موعد|Book an appointment"))
            await heading.first.wait_for(state="visible", timeout=10_000)

            # Stepper nav should be present (aria-label "مراحل الحجز").
            nav = page.locator('nav[aria-label*="مراحل الحجز"], nav[aria-label*="Booking steps"]')
            if await nav.count() == 0:
                raise AssertionError("BranchBookingForm stepper nav not found")

            await page.screenshot(path=str(SHOTS / "03_form_visible.png"))
            print("OK — BranchBookingForm rendered on branch detail page.")
        except Exception as exc:
            print("E2E BRANCH FORM FAILURE:", exc)
            traceback.print_exc()
            try:
                await page.screenshot(path=str(SHOTS / "99_failure.png"))
            except Exception:
                pass
            sys.exit(1)
        finally:
            await context.close()
            await browser.close()


asyncio.run(run())
