"""
Slot-hold banner E2E — verifies that after reaching the time picker with
a chosen slot, the SlotHoldBanner renders with role="status" and shows the
"holding" text (Arabic default). This is the visible signal that a
5-minute hold is active on behalf of the guest.

Env:
  E2E_BASE_URL   default http://localhost:8080
  E2E_ARTIFACTS  default ./e2e-artifacts
"""
import asyncio, os, re, sys, traceback
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
ART = Path(os.environ.get("E2E_ARTIFACTS", "e2e-artifacts")).resolve()
SHOTS = ART / "screenshots" / "book-hold"
SHOTS.mkdir(parents=True, exist_ok=True)


async def shot(page, name):
    await page.screenshot(path=str(SHOTS / f"{name}.png"))


async def walk_to_time(page):
    await page.locator("button", has_text=re.compile(r"عيادات تخصصية|Specialty Clinics")).first.click()
    await page.wait_for_timeout(600)
    await page.locator("button.text-start.rounded-xl.border-2").first.click()
    await page.wait_for_timeout(400)
    await page.locator("button.rounded-xl.border-2.p-4.text-center").first.click()
    await page.wait_for_timeout(600)
    doc = page.locator("button.text-start.rounded-xl.border-2:not([disabled])").first
    if await doc.count() == 0:
        raise AssertionError("no available doctor")
    await doc.click()
    await page.wait_for_timeout(1400)
    day_buttons = page.locator("div.grid.grid-cols-7 > button:not([disabled])")
    for i in range(min(await day_buttons.count(), 7)):
        await day_buttons.nth(i).click()
        await page.wait_for_timeout(900)
        slot = page.locator(
            "div.grid.grid-cols-3 > button:not([disabled]), "
            "div.grid.grid-cols-5 > button:not([disabled])"
        ).first
        if await slot.count() > 0:
            await slot.click()
            return True
        await page.get_by_role("button", name=re.compile(r"^السابق|^Back")).click()
        await page.wait_for_timeout(400)
        day_buttons = page.locator("div.grid.grid-cols-7 > button:not([disabled])")
    return False


async def run():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800}, locale="ar-SA")
        page = await context.new_page()
        try:
            await page.goto(f"{BASE}/book", wait_until="domcontentloaded")
            await page.wait_for_selector("h1", timeout=15000)
            picked = await walk_to_time(page)
            if not picked:
                raise AssertionError("could not pick a time slot")
            await page.wait_for_timeout(1500)
            await shot(page, "01_after_slot_pick")

            # SlotHoldBanner uses role="status" with the holding text.
            banner = page.locator('[role="status"]').filter(
                has_text=re.compile(r"محجوز لك مؤقتًا|held for you|ينتهي حجزك|about to expire")
            )
            count = await banner.count()
            if count == 0:
                raise AssertionError("SlotHoldBanner (role=status) not visible after picking slot")
            text = (await banner.first.inner_text()).strip()
            if not text:
                raise AssertionError("hold banner is empty")
            # Countdown format m:ss should appear
            if not re.search(r"\d+:\d{2}", text):
                raise AssertionError(f"hold banner missing countdown m:ss — got: {text!r}")
            print(f"OK — SlotHoldBanner active with text: {text!r}")
        except Exception as exc:
            print("E2E HOLD FAILURE:", exc)
            traceback.print_exc()
            try:
                await shot(page, "99_failure")
            except Exception:
                pass
            sys.exit(1)
        finally:
            await context.close()
            await browser.close()


asyncio.run(run())
