"""
Full /book journey in English locale (Playwright, headless Chromium).

Targets deterministic E2E fixtures seeded by
scripts/ci/ensure-e2e-booking-fixtures.py — selects them by name via
env vars so the wizard never picks a real production doctor by accident.

Env:
  E2E_BASE_URL       default http://localhost:8080
  E2E_ARTIFACTS      default ./e2e-artifacts
  E2E_BRANCH_NAME    default "فرع اختبار E2E"
  E2E_SPECIALTY_NAME default "تخصص اختبار"
  E2E_DOCTOR_NAME    default "د. اختبار E2E"
"""
import asyncio, os, re, sys, traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _helpers import (
    make_recording_context,
    finalize_context,
    retry_async,
    retry_click,
    retry_goto,
    pick_by_text,
)

from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
BRANCH_NAME = os.environ.get("E2E_BRANCH_NAME", "فرع اختبار E2E")
SPECIALTY_NAME = os.environ.get("E2E_SPECIALTY_NAME", "تخصص اختبار")
DOCTOR_NAME = os.environ.get("E2E_DOCTOR_NAME", "د. اختبار E2E")


async def run():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context, art = await make_recording_context(browser, name="book-en", locale="en-US")
        page = await context.new_page()
        shots = art["screenshots"]

        async def shot(name):
            await page.screenshot(path=str(shots / f"{name}.png"))

        console_errors: list[str] = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

        ok = False
        try:
            await retry_goto(page, f"{BASE}/book?lng=en")
            await retry_async(lambda: page.wait_for_selector("h1", timeout=15_000), label="wait h1")
            try:
                await page.get_by_role("button", name=re.compile(r"Skip|تخطي")).click(timeout=1500)
            except Exception:
                pass
            await shot("01_step1_service")

            # Step 1 — Service (still first choice: "Specialty Clinics")
            await retry_click(
                page.locator("button", has_text=re.compile(r"Specialty Clinics|عيادات تخصصية")).first
            )
            await page.wait_for_timeout(700)
            await shot("02_step2_branch")

            # Step 2 — Branch (target fixture by name)
            await pick_by_text(page, "button.text-start.rounded-xl.border-2", BRANCH_NAME)
            await page.wait_for_timeout(400)
            await shot("03_step3_specialty")

            # Step 3 — Specialty
            await pick_by_text(page, "button.rounded-xl.border-2.p-4.text-center", SPECIALTY_NAME)
            await page.wait_for_timeout(600)
            await shot("04_step4_doctor")

            # Step 4 — Doctor
            await pick_by_text(
                page, "button.text-start.rounded-xl.border-2:not([disabled])", DOCTOR_NAME
            )
            await page.wait_for_timeout(600)
            await shot("05_step5_date")

            # Step 5 — Date
            await page.wait_for_timeout(1500)
            day_buttons = page.locator("div.grid.grid-cols-7 > button:not([disabled])")
            picked = False
            for i in range(min(await day_buttons.count(), 7)):
                await retry_click(day_buttons.nth(i))
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
                raise AssertionError("EN: no time slots any day for E2E doctor")
            await shot("06_step6_time")

            # Step 6 — Time
            await retry_click(
                page.locator(
                    "div.grid.grid-cols-3 > button:not([disabled]), "
                    "div.grid.grid-cols-5 > button:not([disabled])"
                ).first
            )
            await page.wait_for_timeout(500)
            await shot("07_step7_patient")

            # Step 7 — Patient
            await page.get_by_placeholder(re.compile(r"Full name|الاسم كما في الهوية")).fill("Test Patient EN")
            await page.get_by_placeholder("05XXXXXXXX").fill("0501234567")
            await page.locator("button", has_text=re.compile(r"^Male$|^ذكر$")).first.click()
            await page.wait_for_timeout(200)
            await page.get_by_role("button", name=re.compile(r"^Next|^التالي")).click()
            await page.wait_for_timeout(500)
            await shot("08_step8_review")

            # Step 8 — Confirm
            await retry_click(
                page.get_by_role("button", name=re.compile(r"Confirm booking|تأكيد الحجز"))
            )
            await retry_async(
                lambda: page.wait_for_selector(
                    "text=/Your booking is confirmed|Thank you|تم تأكيد حجزك|شكرًا لك/",
                    timeout=20_000,
                ),
                label="wait success",
            )
            await shot("09_success")

            print("OK — EN full journey completed against E2E fixtures.")
            print("console errors:", console_errors[-10:])
            ok = True
        except Exception as exc:
            print("E2E EN FAILURE:", exc)
            traceback.print_exc()
            print("console errors (tail):", console_errors[-20:])
        finally:
            await finalize_context(context, art, page, ok=ok)
            await browser.close()
        sys.exit(0 if ok else 1)


asyncio.run(run())
