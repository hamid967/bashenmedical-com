"""
Booking conflict UX E2E — intercept POST /api/public/book/create and
force a { ok:false, kind:"conflict" } response, then verify the wizard
bounces the user back to step 6 (time picker) and surfaces the friendly
Arabic conflict message. This exercises the `already_booked` code path
without requiring two real bookings to race for the same slot.

Env:
  E2E_BASE_URL   default http://localhost:8080
  E2E_ARTIFACTS  default ./e2e-artifacts
"""
import asyncio, os, re, sys, traceback, json
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
ART = Path(os.environ.get("E2E_ARTIFACTS", "e2e-artifacts")).resolve()
SHOTS = ART / "screenshots" / "book-conflict"
SHOTS.mkdir(parents=True, exist_ok=True)


async def shot(page, name):
    await page.screenshot(path=str(SHOTS / f"{name}.png"))


async def run():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800}, locale="ar-SA")
        page = await context.new_page()

        conflict_msg_ar = "هذا الموعد لم يعد متاحًا. يرجى اختيار وقت آخر."

        async def handler(route):
            await route.fulfill(
                status=409,
                content_type="application/json",
                body=json.dumps({"ok": False, "kind": "conflict", "message": conflict_msg_ar}),
            )

        await context.route("**/api/public/book/create", handler)

        try:
            await page.goto(f"{BASE}/book", wait_until="domcontentloaded")
            await page.wait_for_selector("h1", timeout=15000)

            # Walk through steps 1..6.
            await page.locator("button", has_text=re.compile(r"عيادات تخصصية|Specialty Clinics")).first.click()
            await page.wait_for_timeout(600)
            await page.locator("button.text-start.rounded-xl.border-2").first.click()
            await page.wait_for_timeout(400)
            await page.locator("button.rounded-xl.border-2.p-4.text-center").first.click()
            await page.wait_for_timeout(600)
            await page.locator("button.text-start.rounded-xl.border-2:not([disabled])").first.click()
            await page.wait_for_timeout(1500)

            day_buttons = page.locator("div.grid.grid-cols-7 > button:not([disabled])")
            picked = False
            for i in range(min(await day_buttons.count(), 7)):
                await day_buttons.nth(i).click()
                await page.wait_for_timeout(900)
                slot = page.locator(
                    "div.grid.grid-cols-3 > button:not([disabled]), "
                    "div.grid.grid-cols-5 > button:not([disabled])"
                ).first
                if await slot.count() > 0:
                    await slot.click()
                    picked = True
                    break
                await page.get_by_role("button", name=re.compile(r"^السابق|^Back")).click()
                await page.wait_for_timeout(400)
                day_buttons = page.locator("div.grid.grid-cols-7 > button:not([disabled])")
            if not picked:
                raise AssertionError("could not pick any time slot")

            # Step 7 — Patient info
            await page.get_by_placeholder(re.compile(r"الاسم كما في الهوية|Full name")).fill("اختبار تعارض")
            await page.get_by_placeholder("05XXXXXXXX").fill("0501234567")
            await page.locator("button", has_text=re.compile(r"^ذكر$|^Male$")).first.click()
            await page.get_by_role("button", name=re.compile(r"^التالي|^Next")).click()
            await page.wait_for_timeout(500)
            await shot(page, "01_review")

            # Confirm — will hit our intercepted 409 conflict.
            await page.get_by_role("button", name=re.compile(r"تأكيد الحجز|Confirm booking")).click()

            # Assertion 1: the wizard is bounced back to step 6 (time picker).
            await page.wait_for_function(
                """() => {
                    const el = document.querySelector('[aria-current="step"]');
                    if (!el) return false;
                    const label = (el.getAttribute('aria-label') || el.textContent || '');
                    return label.includes('6');
                }""",
                timeout=8000,
            )
            await shot(page, "02_bounced_to_step6")

            # Assertion 2: the friendly conflict message appears somewhere on screen.
            body_text = await page.locator("body").inner_text()
            if "لم يعد متاحًا" not in body_text and "no longer available" not in body_text.lower():
                raise AssertionError(
                    f"conflict message not surfaced. Body excerpt: {body_text[:400]!r}"
                )

            print("OK — conflict bounces to step 6 and shows friendly message.")
        except Exception as exc:
            print("E2E CONFLICT FAILURE:", exc)
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
