"""
CenterBookingForm render E2E — navigates to /excellence/cardiology and
verifies the embedded CenterBookingForm renders with its Arabic heading
("احجز موعدك في …").

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
SHOTS = ART / "screenshots" / "book-center-form"
SHOTS.mkdir(parents=True, exist_ok=True)


async def run():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800}, locale="ar-SA")
        page = await context.new_page()
        try:
            await page.goto(f"{BASE}/excellence/cardiology", wait_until="domcontentloaded")
            await page.wait_for_load_state("networkidle", timeout=15000)
            await page.wait_for_timeout(800)
            await page.screenshot(path=str(SHOTS / "01_center_page.png"))

            heading = page.locator('h3', has_text=re.compile(r"احجز موعدك|Book your appointment"))
            await heading.first.wait_for(state="visible", timeout=10_000)

            form = page.locator("form")
            if await form.count() == 0:
                raise AssertionError("CenterBookingForm <form> element not found")

            await page.screenshot(path=str(SHOTS / "02_form_visible.png"))
            print("OK — CenterBookingForm rendered on /excellence/cardiology.")
        except Exception as exc:
            print("E2E CENTER FORM FAILURE:", exc)
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
