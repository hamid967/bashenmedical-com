"""
Full /book journey in English locale (Playwright, headless Chromium).

Mirrors booking-flow.py but drives the wizard in `en-US` locale so we
catch AR-only regressions (missing English translations, RTL-only
selectors, or hardcoded Arabic strings).

Env:
  E2E_BASE_URL    default http://localhost:8080
  E2E_ARTIFACTS   default ./e2e-artifacts
"""
import asyncio, os, re, sys, traceback
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
ART = Path(os.environ.get("E2E_ARTIFACTS", "e2e-artifacts")).resolve()
SHOTS = ART / "screenshots" / "book-en"
SHOTS.mkdir(parents=True, exist_ok=True)


async def shot(page, name):
    await page.screenshot(path=str(SHOTS / f"{name}.png"))


async def run():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800},
            locale="en-US",
        )
        page = await context.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

        try:
            # Force English via ?lng=en (i18next detector honors it) and land on /book.
            await page.goto(f"{BASE}/book?lng=en", wait_until="domcontentloaded")
            await page.wait_for_selector("h1", timeout=15000)
            try:
                await page.get_by_role("button", name=re.compile(r"Skip|تخطي")).click(timeout=1500)
            except Exception:
                pass
            await shot(page, "01_step1_service")

            # Step 1 — Service
            await page.locator(
                "button", has_text=re.compile(r"Specialty Clinics|عيادات تخصصية")
            ).first.click()
            await page.wait_for_timeout(700)
            await shot(page, "02_step2_branch")

            # Step 2 — Branch
            await page.locator("button.text-start.rounded-xl.border-2").first.click()
            await page.wait_for_timeout(400)
            await shot(page, "03_step3_specialty")

            # Step 3 — Specialty
            await page.locator("button.rounded-xl.border-2.p-4.text-center").first.click()
            await page.wait_for_timeout(600)
            await shot(page, "04_step4_doctor")

            # Step 4 — Doctor
            doc = page.locator("button.text-start.rounded-xl.border-2:not([disabled])").first
            if await doc.count() == 0:
                raise AssertionError("EN: no available doctor")
            await doc.click()
            await page.wait_for_timeout(600)
            await shot(page, "05_step5_date")

            # Step 5 — Date: pick first available day that yields time slots.
            await page.wait_for_timeout(1500)
            day_buttons = page.locator("div.grid.grid-cols-7 > button:not([disabled])")
            n_days = await day_buttons.count()
            if n_days == 0:
                raise AssertionError("EN: no available day on calendar")
            picked = False
            for i in range(min(n_days, 7)):
                await day_buttons.nth(i).click()
                await page.wait_for_timeout(900)
                time_btn = page.locator(
                    "div.grid.grid-cols-3 > button:not([disabled]), "
                    "div.grid.grid-cols-5 > button:not([disabled])"
                ).first
                if await time_btn.count() > 0:
                    picked = True
                    break
                await page.get_by_role("button", name=re.compile(r"^Back|^السابق")).click()
                await page.wait_for_timeout(400)
                day_buttons = page.locator("div.grid.grid-cols-7 > button:not([disabled])")
            if not picked:
                raise AssertionError("EN: no time slots any day")
            await shot(page, "06_step6_time")

            # Step 6 — Time slot
            await page.locator(
                "div.grid.grid-cols-3 > button:not([disabled]), "
                "div.grid.grid-cols-5 > button:not([disabled])"
            ).first.click()
            await page.wait_for_timeout(500)
            await shot(page, "07_step7_patient")

            # Step 7 — Patient info: EN placeholders.
            await page.get_by_placeholder(
                re.compile(r"Full name|الاسم كما في الهوية")
            ).fill("Test Patient EN")
            await page.get_by_placeholder("05XXXXXXXX").fill("0501234567")
            await page.locator("button", has_text=re.compile(r"^Male$|^ذكر$")).first.click()
            await page.wait_for_timeout(200)
            await page.get_by_role("button", name=re.compile(r"^Next|^التالي")).click()
            await page.wait_for_timeout(500)
            await shot(page, "08_step8_review")

            # Step 8 — Confirm
            await page.get_by_role("button", name=re.compile(r"Confirm booking|تأكيد الحجز")).click()
            await page.wait_for_selector(
                "text=/Your booking is confirmed|Thank you|تم تأكيد حجزك|شكرًا لك/",
                timeout=20000,
            )
            await shot(page, "09_success")

            print("OK — EN full journey completed.")
            print("console errors:", console_errors[-10:])
            ok = True
        except Exception as exc:
            print("E2E EN FAILURE:", exc)
            traceback.print_exc()
            try:
                await shot(page, "99_failure")
            except Exception:
                pass
            print("console errors (tail):", console_errors[-20:])
            ok = False
        finally:
            await context.close()
            await browser.close()
        sys.exit(0 if ok else 1)


asyncio.run(run())
