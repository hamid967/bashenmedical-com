"""
Booking conflict UX E2E — intercept POST /api/public/book/create and
force a { ok:false, kind:"conflict" } response, then verify the wizard
bounces the user back to step 6 (time picker) and surfaces the friendly
Arabic conflict message.

Uses deterministic E2E fixtures selected by name so the mocked conflict
never races against real production data.

Env:
  E2E_BASE_URL       default http://localhost:8080
  E2E_ARTIFACTS      default ./e2e-artifacts
  E2E_BRANCH_NAME    default "فرع اختبار E2E"
  E2E_SPECIALTY_NAME default "تخصص اختبار"
  E2E_DOCTOR_NAME    default "د. اختبار E2E"
"""
import asyncio, os, re, sys, traceback, json
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
        context, art = await make_recording_context(browser, name="book-conflict", locale="ar-SA")
        page = await context.new_page()
        shots = art["screenshots"]

        conflict_msg_ar = "هذا الموعد لم يعد متاحًا. يرجى اختيار وقت آخر."

        async def handler(route):
            await route.fulfill(
                status=409,
                content_type="application/json",
                body=json.dumps({"ok": False, "kind": "conflict", "message": conflict_msg_ar}),
            )

        await context.route("**/api/public/book/create", handler)

        ok = False
        try:
            await retry_goto(page, f"{BASE}/book")
            await retry_async(lambda: page.wait_for_selector("h1", timeout=15_000), label="wait h1")

            await retry_click(
                page.locator("button", has_text=re.compile(r"عيادات تخصصية|Specialty Clinics")).first
            )
            await page.wait_for_timeout(600)
            await pick_by_text(page, "button.text-start.rounded-xl.border-2", BRANCH_NAME)
            await page.wait_for_timeout(400)
            await pick_by_text(page, "button.rounded-xl.border-2.p-4.text-center", SPECIALTY_NAME)
            await page.wait_for_timeout(600)
            await pick_by_text(
                page, "button.text-start.rounded-xl.border-2:not([disabled])", DOCTOR_NAME
            )
            await page.wait_for_timeout(1500)

            day_buttons = page.locator("div.grid.grid-cols-7 > button:not([disabled])")
            picked = False
            for i in range(min(await day_buttons.count(), 7)):
                await retry_click(day_buttons.nth(i))
                await page.wait_for_timeout(900)
                slot = page.locator(
                    "div.grid.grid-cols-3 > button:not([disabled]), "
                    "div.grid.grid-cols-5 > button:not([disabled])"
                ).first
                if await slot.count() > 0:
                    await retry_click(slot)
                    picked = True
                    break
                await page.get_by_role("button", name=re.compile(r"^السابق|^Back")).click()
                await page.wait_for_timeout(400)
                day_buttons = page.locator("div.grid.grid-cols-7 > button:not([disabled])")
            if not picked:
                raise AssertionError("could not pick any time slot for E2E doctor")

            await page.get_by_placeholder(re.compile(r"الاسم كما في الهوية|Full name")).fill("اختبار تعارض")
            await page.get_by_placeholder("05XXXXXXXX").fill("0501234567")
            await page.locator("button", has_text=re.compile(r"^ذكر$|^Male$")).first.click()
            await page.get_by_role("button", name=re.compile(r"^التالي|^Next")).click()
            await page.wait_for_timeout(500)
            await page.screenshot(path=str(shots / "01_review.png"))

            await retry_click(
                page.get_by_role("button", name=re.compile(r"تأكيد الحجز|Confirm booking"))
            )

            await retry_async(
                lambda: page.wait_for_function(
                    """() => {
                        const el = document.querySelector('[aria-current="step"]');
                        if (!el) return false;
                        const label = (el.getAttribute('aria-label') || el.textContent || '');
                        return label.includes('6');
                    }""",
                    timeout=8_000,
                ),
                label="wait bounce to step 6",
            )
            await page.screenshot(path=str(shots / "02_bounced_to_step6.png"))

            body_text = await page.locator("body").inner_text()
            if "لم يعد متاحًا" not in body_text and "no longer available" not in body_text.lower():
                raise AssertionError(
                    f"conflict message not surfaced. Body excerpt: {body_text[:400]!r}"
                )

            print("OK — conflict bounces to step 6 and shows friendly message.")
            ok = True
        except Exception as exc:
            print("E2E CONFLICT FAILURE:", exc)
            traceback.print_exc()
        finally:
            await finalize_context(context, art, page, ok=ok)
            await browser.close()
        sys.exit(0 if ok else 1)


asyncio.run(run())
