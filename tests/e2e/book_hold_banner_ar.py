"""
Slot-hold banner E2E — verifies that after reaching the time picker with
a chosen slot, the SlotHoldBanner renders with role="status" and shows
the "holding" text (Arabic default) plus a m:ss countdown.

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


async def walk_to_time(page):
    await retry_click(
        page.locator("button", has_text=re.compile(r"عيادات تخصصية|Specialty Clinics")).first
    )
    await page.wait_for_timeout(600)
    await retry_click(page.locator("button.text-start.rounded-xl.border-2").first)
    await page.wait_for_timeout(400)
    await retry_click(page.locator("button.rounded-xl.border-2.p-4.text-center").first)
    await page.wait_for_timeout(600)
    doc = page.locator("button.text-start.rounded-xl.border-2:not([disabled])").first
    if await doc.count() == 0:
        raise AssertionError("no available doctor")
    await retry_click(doc)
    await page.wait_for_timeout(1400)
    day_buttons = page.locator("div.grid.grid-cols-7 > button:not([disabled])")
    for i in range(min(await day_buttons.count(), 7)):
        await retry_click(day_buttons.nth(i))
        await page.wait_for_timeout(900)
        slot = page.locator(
            "div.grid.grid-cols-3 > button:not([disabled]), "
            "div.grid.grid-cols-5 > button:not([disabled])"
        ).first
        if await slot.count() > 0:
            await retry_click(slot)
            return True
        await page.get_by_role("button", name=re.compile(r"^السابق|^Back")).click()
        await page.wait_for_timeout(400)
        day_buttons = page.locator("div.grid.grid-cols-7 > button:not([disabled])")
    return False


async def run():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context, art = await make_recording_context(browser, name="book-hold", locale="ar-SA")
        page = await context.new_page()
        shots = art["screenshots"]

        ok = False
        try:
            await retry_goto(page, f"{BASE}/book")
            await retry_async(lambda: page.wait_for_selector("h1", timeout=15_000), label="wait h1")
            picked = await walk_to_time(page)
            if not picked:
                raise AssertionError("could not pick a time slot")
            await page.wait_for_timeout(1500)
            await page.screenshot(path=str(shots / "01_after_slot_pick.png"))

            banner = page.locator('[role="status"]').filter(
                has_text=re.compile(r"محجوز لك مؤقتًا|held for you|ينتهي حجزك|about to expire")
            )
            if await banner.count() == 0:
                raise AssertionError("SlotHoldBanner (role=status) not visible after picking slot")
            text = (await banner.first.inner_text()).strip()
            if not re.search(r"\d+:\d{2}", text):
                raise AssertionError(f"hold banner missing countdown m:ss — got: {text!r}")

            print(f"OK — SlotHoldBanner active with text: {text!r}")
            ok = True
        except Exception as exc:
            print("E2E HOLD FAILURE:", exc)
            traceback.print_exc()
        finally:
            await finalize_context(context, art, page, ok=ok)
            await browser.close()
        sys.exit(0 if ok else 1)


asyncio.run(run())
