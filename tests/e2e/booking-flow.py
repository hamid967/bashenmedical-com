"""
End-to-end booking flow smoke test (Playwright, headless Chromium).

Flow:
  /doctors  →  click 'احجز موعد' on a card
            →  lands on /doctors/$slug with the inline widget scrolled into view
            →  navigate to /book to run the full 9-step wizard
            →  complete all steps and assert the success screen renders

Env:
  E2E_BASE_URL     — base URL of the running app (default: http://localhost:8080)
  E2E_ARTIFACTS    — directory to write screenshots / video / trace (default: ./e2e-artifacts)

Exits non-zero on failure. In CI the artifacts directory is uploaded when the
job fails so the video/trace/screenshots are available for debugging.
"""
import asyncio, os, re, sys, traceback
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
ART = Path(os.environ.get("E2E_ARTIFACTS", "e2e-artifacts")).resolve()
SHOTS = ART / "screenshots"
VIDEOS = ART / "videos"
TRACES = ART / "traces"
HARS = ART / "hars"
for d in (SHOTS, VIDEOS, TRACES, HARS):
    d.mkdir(parents=True, exist_ok=True)

HAR_PATH = HARS / "booking-flow.har"


async def shot(page, name):
    await page.screenshot(path=str(SHOTS / f"{name}.png"))


async def run():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800},
            locale="ar-SA",
            record_video_dir=str(VIDEOS),
            record_video_size={"width": 1280, "height": 900},
            record_har_path=str(HAR_PATH),
            record_har_content="omit",
        )
        await context.tracing.start(screenshots=True, snapshots=True, sources=True)

        page = await context.new_page()

        console_errors = []
        page.on(
            "console",
            lambda m: console_errors.append(m.text) if m.type == "error" else None,
        )

        try:
            # ---------- 1. /doctors ----------
            await page.goto(f"{BASE}/doctors", wait_until="domcontentloaded")
            try:
                await page.get_by_role("button", name=re.compile(r"تخطي|Skip")).click(timeout=4000)
            except Exception:
                pass
            await page.wait_for_load_state("networkidle", timeout=15000)
            await page.wait_for_timeout(1500)
            await shot(page, "01_doctors_list")

            book_link = page.locator("article").first.locator(
                "a", has_text=re.compile(r"احجز|Book")
            ).first
            href = await book_link.get_attribute("href")
            print("book link href:", href)
            assert href and re.search(r"/doctors/[^#/?]+", href), f"bad href: {href}"

            # ---------- 2. Click → /doctors/$slug#book ----------
            await book_link.click()
            await page.wait_for_url(re.compile(r"/doctors/[^/]+"))
            await page.wait_for_load_state("networkidle", timeout=10000)
            await page.wait_for_selector("#book", timeout=10000)
            await page.wait_for_timeout(1200)
            await shot(page, "02_doctor_page_book_widget")

            # ---------- 3. /book wizard ----------
            await page.goto(f"{BASE}/book", wait_until="domcontentloaded")
            await page.wait_for_selector("h1", timeout=10000)
            try:
                await page.get_by_role("button", name=re.compile(r"تخطي|Skip")).click(timeout=1500)
            except Exception:
                pass
            await shot(page, "03_book_step1_service")

            await page.locator(
                "button", has_text=re.compile(r"عيادات تخصصية|Specialty Clinics")
            ).first.click()
            await page.wait_for_timeout(900)
            await shot(page, "04_book_step2_branch")

            await page.locator("button.text-start.rounded-xl.border-2").first.click()
            await page.wait_for_timeout(400)
            await shot(page, "05_book_step3_specialty")

            await page.locator("button.rounded-xl.border-2.p-4.text-center").first.click()
            await page.wait_for_timeout(600)
            await shot(page, "06_book_step4_doctor")

            doc_btn = page.locator("button.text-start.rounded-xl.border-2:not([disabled])").first
            if await doc_btn.count() == 0:
                raise AssertionError("no available doctor for this specialty/branch")
            await doc_btn.click()
            await page.wait_for_timeout(600)
            await shot(page, "07_book_step5_date")

            await page.wait_for_timeout(1500)
            day_buttons = page.locator("div.grid.grid-cols-7 > button:not([disabled])")
            n_days = await day_buttons.count()
            print(f"available days on calendar: {n_days}")
            if n_days == 0:
                raise AssertionError("no available day on the calendar this month")

            picked = False
            for i in range(min(n_days, 7)):
                await day_buttons.nth(i).click()
                await page.wait_for_timeout(900)
                time_btn = page.locator(
                    "div.grid.grid-cols-3 > button:not([disabled]), "
                    "div.grid.grid-cols-5 > button:not([disabled])"
                ).first
                if await time_btn.count() > 0:
                    await shot(page, "08_book_step6_time")
                    picked = True
                    break
                await shot(page, f"08_no_time_day{i}")
                await page.get_by_role("button", name=re.compile(r"^السابق|^Back")).click()
                await page.wait_for_timeout(500)
                day_buttons = page.locator("div.grid.grid-cols-7 > button:not([disabled])")
            if not picked:
                raise AssertionError("no available time slot on any day")

            await page.locator(
                "div.grid.grid-cols-3 > button:not([disabled]), "
                "div.grid.grid-cols-5 > button:not([disabled])"
            ).first.click()
            await page.wait_for_timeout(400)
            await shot(page, "09_book_step7_patient")

            await page.get_by_placeholder(
                re.compile("الاسم كما في الهوية|Full name")
            ).fill("محمد أحمد الاختبار")
            await page.get_by_placeholder("05XXXXXXXX").fill("0501234567")
            await page.locator("button", has_text=re.compile(r"^ذكر$|^Male$")).first.click()
            await page.wait_for_timeout(200)
            await page.get_by_role("button", name=re.compile("^التالي|^Next")).click()
            await page.wait_for_timeout(500)
            await shot(page, "10_book_step8_review")

            await page.get_by_role("button", name=re.compile("تأكيد الحجز|Confirm booking")).click()
            await page.wait_for_selector(
                "text=/تم تأكيد حجزك|Your booking is confirmed/", timeout=20000
            )
            await page.wait_for_timeout(600)
            await shot(page, "11_book_step9_success")

            ref_locator = page.locator(
                "span.text-2xl.font-mono, span.md\\:text-3xl.font-mono"
            ).first
            if await ref_locator.count() > 0:
                print("BOOKING REFERENCE:", (await ref_locator.inner_text()).strip())

            print("SUCCESS — full booking flow completed.")
            print("console errors:", console_errors[-10:])
            ok = True
        except Exception as exc:
            print("E2E FAILURE:", exc)
            traceback.print_exc()
            try:
                await shot(page, "99_failure")
            except Exception:
                pass
            print("console errors (tail):", console_errors[-20:])
            ok = False
        finally:
            try:
                await context.tracing.stop(path=str(TRACES / "trace.zip"))
            except Exception:
                pass
            await context.close()
            await browser.close()

        sys.exit(0 if ok else 1)


asyncio.run(run())
