"""
CenterBookingForm render E2E — navigates to /excellence/cardiology and
verifies the embedded CenterBookingForm renders.

Non-destructive: does not submit a booking.

Env:
  E2E_BASE_URL   default http://localhost:8080
  E2E_ARTIFACTS  default ./e2e-artifacts
"""
import asyncio, os, re, sys, traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _helpers import make_recording_context, finalize_context, retry_async, retry_goto

from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")


async def run():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context, art = await make_recording_context(browser, name="book-center-form", locale="ar-SA")
        page = await context.new_page()
        shots = art["screenshots"]

        ok = False
        try:
            await retry_goto(page, f"{BASE}/excellence/cardiology")
            await retry_async(
                lambda: page.wait_for_load_state("networkidle", timeout=15_000),
                label="center networkidle",
            )
            await page.wait_for_timeout(800)
            await page.screenshot(path=str(shots / "01_center_page.png"))

            heading = page.locator('h3', has_text=re.compile(r"احجز موعدك|Book your appointment"))
            await retry_async(
                lambda: heading.first.wait_for(state="visible", timeout=10_000),
                label="wait form heading",
            )

            form = page.locator("form")
            if await form.count() == 0:
                raise AssertionError("CenterBookingForm <form> element not found")

            await page.screenshot(path=str(shots / "02_form_visible.png"))
            print("OK — CenterBookingForm rendered on /excellence/cardiology.")
            ok = True
        except Exception as exc:
            print("E2E CENTER FORM FAILURE:", exc)
            traceback.print_exc()
        finally:
            await finalize_context(context, art, page, ok=ok)
            await browser.close()
        sys.exit(0 if ok else 1)


asyncio.run(run())
