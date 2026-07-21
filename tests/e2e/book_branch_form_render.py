"""
BranchBookingForm render E2E — navigates to /branches, opens the first
branch's page, and verifies the embedded BranchBookingForm renders.

Non-destructive: does not submit a booking.

Env:
  E2E_BASE_URL   default http://localhost:8080
  E2E_ARTIFACTS  default ./e2e-artifacts
"""
import asyncio, os, re, sys, traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _helpers import make_recording_context, finalize_context, retry_async, retry_click, retry_goto

from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")


async def run():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context, art = await make_recording_context(browser, name="book-branch-form", locale="ar-SA")
        page = await context.new_page()
        shots = art["screenshots"]

        ok = False
        try:
            await retry_goto(page, f"{BASE}/branches")
            await retry_async(
                lambda: page.wait_for_load_state("networkidle", timeout=15_000),
                label="branches networkidle",
            )
            await page.wait_for_timeout(800)
            await page.screenshot(path=str(shots / "01_branches_list.png"))

            branch_link = page.locator('a[href^="/branches/"]:not([href="/branches"])').first
            if await branch_link.count() == 0:
                raise AssertionError("no branch detail link found on /branches")
            await retry_click(branch_link)
            await retry_async(
                lambda: page.wait_for_url(re.compile(r"/branches/[^/]+"), timeout=10_000),
                label="wait branch url",
            )
            await retry_async(
                lambda: page.wait_for_load_state("networkidle", timeout=15_000),
                label="branch networkidle",
            )
            await page.wait_for_timeout(1000)
            await page.screenshot(path=str(shots / "02_branch_page.png"))

            heading = page.locator('h3', has_text=re.compile(r"احجز موعد|Book an appointment"))
            await retry_async(
                lambda: heading.first.wait_for(state="visible", timeout=10_000),
                label="wait form heading",
            )

            nav = page.locator('nav[aria-label*="مراحل الحجز"], nav[aria-label*="Booking steps"]')
            if await nav.count() == 0:
                raise AssertionError("BranchBookingForm stepper nav not found")

            await page.screenshot(path=str(shots / "03_form_visible.png"))
            print("OK — BranchBookingForm rendered on branch detail page.")
            ok = True
        except Exception as exc:
            print("E2E BRANCH FORM FAILURE:", exc)
            traceback.print_exc()
        finally:
            await finalize_context(context, art, page, ok=ok)
            await browser.close()
        sys.exit(0 if ok else 1)


asyncio.run(run())
