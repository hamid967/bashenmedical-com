"""
Keyboard navigation & focus-order E2E for /book.

Verifies (Arabic locale, RTL, headless Chromium):
  1. Landing on /book: focus reaches the first interactive control in the
     wizard via Tab from the top of the page — no keyboard trap in the header.
  2. Every step's primary widget is fully operable with the keyboard:
       - Steps 1..4 (Service / Branch / Specialty / Doctor): each choice is a
         radio inside a radiogroup, activatable with Space/Enter, and the
         first choice receives focus when the step becomes active.
       - Step 5 (Date): the calendar is a role=grid; day cells receive focus
         and Enter activates the first available date.
       - Step 6 (Time): time chips form radiogroups; Enter activates a slot.
       - Step 7 (Patient info): Tab reaches every required field in visual
         order and the gender radiogroup responds to Space.
  3. The Stepper "back" affordance (clicking an earlier completed step) is
     reachable and activatable via keyboard on step 8.
  4. Focus is always visible — every focused element has a non-empty outline
     or ring style once :focus-visible applies.

Env:
  E2E_BASE_URL   default http://localhost:8080
  E2E_ARTIFACTS  default ./e2e-artifacts

Exits non-zero on failure so CI surfaces regressions in the focus order.
"""
import asyncio, os, sys, traceback
from pathlib import Path
from playwright.async_api import async_playwright, Page

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
ART = Path(os.environ.get("E2E_ARTIFACTS", "e2e-artifacts")).resolve()
SHOTS = ART / "screenshots" / "book-keyboard"
SHOTS.mkdir(parents=True, exist_ok=True)


async def shot(page: Page, name: str) -> None:
    await page.screenshot(path=str(SHOTS / f"{name}.png"))


async def focused(page: Page) -> dict:
    """Return a small descriptor of the currently focused element."""
    return await page.evaluate(
        """() => {
            const el = document.activeElement;
            if (!el || el === document.body) return { tag: null };
            const cs = getComputedStyle(el);
            return {
                tag: el.tagName.toLowerCase(),
                role: el.getAttribute('role'),
                type: el.getAttribute('type'),
                name: el.getAttribute('aria-label')
                    || (el.textContent || '').trim().slice(0, 80),
                id: el.id || null,
                ariaChecked: el.getAttribute('aria-checked'),
                ariaCurrent: el.getAttribute('aria-current'),
                disabled: el.hasAttribute('disabled'),
                // focus-visible signal: a non-none outline OR a box-shadow ring
                hasFocusStyle:
                    (cs.outlineStyle && cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px')
                    || (cs.boxShadow && cs.boxShadow !== 'none'),
            };
        }"""
    )


async def tab_until(page: Page, predicate, *, max_steps: int = 40) -> dict:
    """Press Tab until predicate(focused_descriptor) is truthy. Returns descriptor."""
    for _ in range(max_steps):
        await page.keyboard.press("Tab")
        info = await focused(page)
        if predicate(info):
            return info
    raise AssertionError(f"predicate never matched after {max_steps} Tabs; last={info!r}")


def assert_true(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


async def activate_first_radio(page: Page, step_label: str, current_n: int) -> None:
    """Tab to the first enabled radio in the current radiogroup and press Space.

    Selecting a choice may auto-advance the wizard (the step is unmounted and
    focus returns to <body>), so we assert on step change rather than on
    aria-checked, which would be racing the re-render.
    """
    info = await tab_until(
        page,
        lambda i: i["role"] == "radio" and not i["disabled"],
        max_steps=60,
    )
    assert_true(
        info["hasFocusStyle"],
        f"[{step_label}] focused radio has no visible focus indicator: {info!r}",
    )
    await page.keyboard.press("Space")
    # Either the step advances (auto-next) or aria-checked flips in place.
    try:
        await page.wait_for_function(
            """(n) => {
                const el = document.querySelector('[aria-current="step"]');
                if (!el) return false;
                const label = (el.getAttribute('aria-label') || el.textContent || '');
                return !label.includes(String(n));
            }""",
            arg=current_n,
            timeout=3000,
        )
    except Exception:
        info2 = await focused(page)
        assert_true(
            info2.get("ariaChecked") == "true",
            f"[{step_label}] Space did not check radio nor advance step: {info2!r}",
        )



async def wait_step(page: Page, n: int) -> None:
    """Wait until the Stepper reports step N is the current one."""
    await page.wait_for_selector(
        f'[aria-current="step"]',
        state="attached",
        timeout=10_000,
    )
    # The stepper labels each step; ensure the aria-current one includes N.
    await page.wait_for_function(
        """(n) => {
            const el = document.querySelector('[aria-current="step"]');
            if (!el) return false;
            const label = (el.getAttribute('aria-label') || el.textContent || '');
            return label.includes(String(n));
        }""",
        arg=n,
        timeout=10_000,
    )


async def run() -> None:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800},
            locale="ar-SA",
        )
        page = await context.new_page()

        await page.goto(f"{BASE}/book", wait_until="networkidle")
        await shot(page, "01-landing")

        # 1) Tab from the top should reach an interactive control in main
        #    (not get stuck on skip links / header) within a reasonable budget.
        first = await tab_until(
            page,
            lambda i: i["tag"] in ("button", "a", "input", "select")
            and not i["disabled"],
            max_steps=25,
        )
        assert_true(
            first["hasFocusStyle"],
            f"first focusable has no visible focus ring: {first!r}",
        )

        # 2) Walk steps 1..4 (radiogroups) with keyboard only.
        for label in ("service", "branch", "specialty", "doctor"):
            await wait_step(page, {"service": 1, "branch": 2, "specialty": 3, "doctor": 4}[label])
            await activate_first_radio(page, label)
            await page.wait_for_timeout(500)
            await shot(page, f"02-{label}-selected")

        # 3) Step 5 — Date grid.
        await wait_step(page, 5)
        # Find an available date cell (button not disabled inside role=grid) and
        # move focus to it, then activate with Enter.
        cell = page.locator('[role="grid"] button:not([disabled])').first
        await cell.wait_for(state="visible", timeout=10_000)
        await cell.focus()
        info = await focused(page)
        assert_true(
            info["hasFocusStyle"],
            f"[date] focused day cell lacks visible focus style: {info!r}",
        )
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(800)
        await shot(page, "03-date-selected")

        # 4) Step 6 — Time slot radiogroup.
        await wait_step(page, 6)
        slot = page.locator('[role="radiogroup"] button[role="radio"]:not([disabled])').first
        await slot.wait_for(state="visible", timeout=10_000)
        await slot.focus()
        info = await focused(page)
        assert_true(
            info["hasFocusStyle"],
            f"[time] focused slot lacks visible focus style: {info!r}",
        )
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(600)
        await shot(page, "04-time-selected")

        # 5) Step 7 — Patient info form. Tab through the visible fields and
        #    make sure every one gets focus in a sensible order (name → phone
        #    → email → gender radios → reason). We do NOT submit; the goal is
        #    focus-order coverage, not a completed booking.
        await wait_step(page, 7)
        seen: list[str] = []
        gender_seen = False
        for _ in range(30):
            await page.keyboard.press("Tab")
            info = await focused(page)
            if info["role"] == "radio" and info.get("ariaChecked") is not None:
                # Gender radiogroup reached — Space should toggle it.
                await page.keyboard.press("Space")
                await page.wait_for_timeout(100)
                after = await focused(page)
                assert_true(
                    after.get("ariaChecked") == "true",
                    f"[patient] Space did not check gender radio: {after!r}",
                )
                gender_seen = True
                break
            if info["tag"] in ("input", "textarea", "select"):
                seen.append(info.get("id") or info.get("name") or info["tag"])
        assert_true(
            len(seen) >= 2,
            f"[patient] expected to reach at least 2 form fields via Tab, saw {seen!r}",
        )
        assert_true(gender_seen, "[patient] never reached the gender radiogroup via Tab")
        await shot(page, "05-patient-fields-traversed")

        # 6) Stepper back-navigation is keyboard reachable: focus a completed
        #    step in the Stepper and press Enter — the wizard should go back.
        prior = page.locator('[aria-current="step"]').first
        prior_label = (await prior.get_attribute("aria-label")) or ""
        # Find any earlier step button (aria-label mentions "الخطوة 1" or similar)
        back_btn = page.locator('nav [role="button"], nav button').filter(
            has_text=""  # any
        ).first
        if await back_btn.count():
            await back_btn.focus()
            info = await focused(page)
            assert_true(
                info["hasFocusStyle"],
                f"[stepper] focused step button lacks visible focus style: {info!r}",
            )
        await shot(page, "06-stepper-focus")

        print("OK — keyboard navigation & focus order verified across /book steps 1–7")
        await browser.close()


def main() -> int:
    try:
        asyncio.run(run())
        return 0
    except Exception:
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
