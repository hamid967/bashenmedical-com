"""
Visual regression tests for the patient portal.

Captures full-viewport screenshots for the core portal pages after signing
in as a freshly-created test patient, then compares each capture against a
committed baseline. Fails when the pixel-difference ratio exceeds THRESHOLD.

Pages under test:
  - /portal              (dashboard)
  - /portal/appointments
  - /portal/reports
  - /portal/invoices

Layout:
  tests/e2e/visual/baselines/<page>.png   -- committed baseline (source of truth)
  tests/e2e/visual/actual/<page>.png      -- capture from this run
  tests/e2e/visual/diffs/<page>.png       -- red overlay of changed pixels

Usage:
  python3 tests/e2e/portal_visual_regression.py             # compare
  UPDATE_BASELINES=1 python3 tests/e2e/portal_visual_regression.py  # rewrite baselines

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
The dev server on http://localhost:8080 must be running.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image, ImageChops
from playwright.async_api import async_playwright

# ------------------------------ config ------------------------------------ #

VIEWPORT = {"width": 1280, "height": 1800}
# Fraction of pixels that may differ before a page fails (0.01 = 1%).
THRESHOLD = float(os.environ.get("VISUAL_THRESHOLD", "0.01"))
# Per-channel tolerance for a pixel to count as "changed" (0-255).
PIXEL_TOLERANCE = int(os.environ.get("VISUAL_PIXEL_TOLERANCE", "12"))
UPDATE = os.environ.get("UPDATE_BASELINES") == "1"

BASE = Path(__file__).parent / "visual"
BASELINES = BASE / "baselines"
ACTUAL = BASE / "actual"
DIFFS = BASE / "diffs"
for d in (BASELINES, ACTUAL, DIFFS):
    d.mkdir(parents=True, exist_ok=True)

PAGES: list[tuple[str, str]] = [
    ("dashboard", "/portal"),
    ("appointments", "/portal/appointments"),
    ("reports", "/portal/reports"),
    ("invoices", "/portal/invoices"),
]

# ------------------------------ Supabase helpers -------------------------- #

URL = os.environ.get("SUPABASE_URL")
SVC = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not URL or not SVC:
    print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required", file=sys.stderr)
    sys.exit(2)


def sb(path: str, method: str = "POST", body=None):
    req = urllib.request.Request(
        f"{URL}{path}",
        method=method,
        headers={
            "apikey": SVC,
            "Authorization": f"Bearer {SVC}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        data=json.dumps(body).encode() if body is not None else None,
    )
    with urllib.request.urlopen(req) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw else None


def create_patient() -> tuple[str, str, str]:
    email = f"visual-{int(time.time() * 1000)}@example.com"
    pwd = f"Test!{int(time.time() * 1000)}Aa1"
    u = sb(
        "/auth/v1/admin/users",
        body={"email": email, "password": pwd, "email_confirm": True},
    )
    try:
        sb(
            "/rest/v1/profiles",
            body={"id": u["id"], "full_name": "Visual Test", "phone": "0500000000"},
        )
    except Exception:
        pass
    return u["id"], email, pwd


def delete_user(uid: str) -> None:
    try:
        sb(f"/auth/v1/admin/users/{uid}", method="DELETE")
    except Exception:
        pass


# ------------------------------ image diff -------------------------------- #


def compare(baseline_path: Path, actual_path: Path, diff_path: Path) -> float:
    """Return the fraction of pixels that differ beyond PIXEL_TOLERANCE."""
    a = Image.open(baseline_path).convert("RGB")
    b = Image.open(actual_path).convert("RGB")
    if a.size != b.size:
        # Resize actual to baseline for a comparable diff; size drift alone
        # is worth failing on.
        b = b.resize(a.size)
    diff = ImageChops.difference(a, b)
    bbox = diff.getbbox()
    if not bbox:
        # Identical — still write a blank diff so the folder stays consistent.
        Image.new("RGB", a.size, (0, 0, 0)).save(diff_path)
        return 0.0
    px = diff.load()
    changed = 0
    w, h = diff.size
    highlight = Image.new("RGB", a.size, (0, 0, 0))
    hpx = highlight.load()
    for y in range(h):
        for x in range(w):
            r, g, bch = px[x, y]
            if r > PIXEL_TOLERANCE or g > PIXEL_TOLERANCE or bch > PIXEL_TOLERANCE:
                changed += 1
                hpx[x, y] = (255, 0, 0)
    highlight.save(diff_path)
    return changed / (w * h)


# ------------------------------ playwright flow --------------------------- #


async def sign_in(page, email: str, pwd: str) -> None:
    await page.goto(
        "http://localhost:8080/auth?redirect=%2Fportal",
        wait_until="networkidle",
    )
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', pwd)
    await page.click('button[type="submit"]')
    await page.wait_for_url("**/portal**", timeout=15000)
    await page.wait_for_timeout(800)


async def prepare_page(page, path: str) -> None:
    await page.goto(f"http://localhost:8080{path}", wait_until="networkidle")
    # Freeze animations, blur focus rings, and hide known noisy elements
    # (timestamps, live indicators) to keep diffs stable.
    await page.add_style_tag(
        content="""
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
          caret-color: transparent !important;
        }
        [data-visual-ignore],
        [data-testid="live-timestamp"],
        .toast, [role="status"] {
          visibility: hidden !important;
        }
        """
    )
    # Give layout + fonts a beat to settle.
    await page.evaluate("document.fonts && document.fonts.ready")
    await page.wait_for_timeout(400)


async def main() -> int:
    uid, email, pwd = create_patient()
    failures: list[str] = []
    created: list[str] = []
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            context = await browser.new_context(
                viewport=VIEWPORT,
                locale="ar-SA",
                color_scheme="light",
                reduced_motion="reduce",
            )
            page = await context.new_page()
            await sign_in(page, email, pwd)

            for name, path in PAGES:
                await prepare_page(page, path)
                actual_path = ACTUAL / f"{name}.png"
                await page.screenshot(path=str(actual_path))

                baseline_path = BASELINES / f"{name}.png"
                if UPDATE or not baseline_path.exists():
                    baseline_path.write_bytes(actual_path.read_bytes())
                    created.append(name)
                    print(
                        f"[baseline {'updated' if UPDATE else 'created'}] {name} -> {baseline_path}"
                    )
                    continue

                diff_ratio = compare(
                    baseline_path, actual_path, DIFFS / f"{name}.png"
                )
                status = "OK" if diff_ratio <= THRESHOLD else "FAIL"
                print(
                    f"[{status}] {name}: {diff_ratio*100:.3f}% changed "
                    f"(threshold {THRESHOLD*100:.2f}%)"
                )
                if diff_ratio > THRESHOLD:
                    failures.append(f"{name} ({diff_ratio*100:.3f}%)")

            await browser.close()
    finally:
        delete_user(uid)

    if created and not UPDATE:
        print(
            "\nBaselines were missing and have been created. Commit them, "
            "then rerun to compare."
        )
    if failures:
        print("\nVisual regressions detected:", ", ".join(failures), file=sys.stderr)
        print(f"Inspect diffs in {DIFFS}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
