#!/usr/bin/env python3
"""
scripts/design/visual-regression.py

Capture visual-regression snapshots of key public routes in the dev preview.
Screens land under /tmp/visual-regression/current/*.png. When baselines exist
under scripts/design/visual-regression/baseline/*.png, each current snapshot is
diffed pixel-by-pixel and a difference percentage plus RGB delta map is
produced under /tmp/visual-regression/diff/*.png.

Usage:
    python3 scripts/design/visual-regression.py               # capture + diff
    python3 scripts/design/visual-regression.py --update      # refresh baselines

The dev server (http://localhost:8080) must already be running.
"""
from __future__ import annotations
import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageChops
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
BASELINE_DIR = ROOT / "scripts" / "design" / "visual-regression" / "baseline"
OUT_ROOT = Path("/tmp/visual-regression")
CURRENT_DIR = OUT_ROOT / "current"
DIFF_DIR = OUT_ROOT / "diff"

BASE_URL = "http://localhost:8080"

# Routes to capture. `wait_for` is an optional selector we must see before
# snapshotting so lazy content renders.
ROUTES = [
    {"name": "home", "path": "/", "wait_for": "main"},
    {"name": "doctors", "path": "/doctors", "wait_for": "main"},
    {"name": "book", "path": "/book", "wait_for": "main"},
    {"name": "auth-login", "path": "/auth/login", "wait_for": "form"},
    {"name": "faq", "path": "/faq", "wait_for": "main"},
    {"name": "insurance-verify", "path": "/insurance/verify", "wait_for": "main"},
]

VIEWPORT = {"width": 1280, "height": 1800}


def diff_images(a: Path, b: Path, out: Path) -> float:
    """Return % of pixels differing above tolerance. Writes a red-highlight overlay."""
    ia = Image.open(a).convert("RGB")
    ib = Image.open(b).convert("RGB")
    if ia.size != ib.size:
        w = min(ia.size[0], ib.size[0])
        h = min(ia.size[1], ib.size[1])
        ia = ia.crop((0, 0, w, h))
        ib = ib.crop((0, 0, w, h))
    diff = ImageChops.difference(ia, ib)
    bbox = diff.getbbox()
    if not bbox:
        out.parent.mkdir(parents=True, exist_ok=True)
        ia.save(out)
        return 0.0
    # Per-pixel change ratio using a modest tolerance (RGB channel > 12).
    tolerance = 12
    px = diff.load()
    w, h = diff.size
    changed = 0
    total = w * h
    highlight = ib.copy()
    hpx = highlight.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if max(r, g, b) > tolerance:
                changed += 1
                hpx[x, y] = (255, 40, 40)
    out.parent.mkdir(parents=True, exist_ok=True)
    highlight.save(out)
    return round(100.0 * changed / total, 4)


async def capture(update_baseline: bool) -> dict:
    CURRENT_DIR.mkdir(parents=True, exist_ok=True)
    DIFF_DIR.mkdir(parents=True, exist_ok=True)
    if update_baseline:
        BASELINE_DIR.mkdir(parents=True, exist_ok=True)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "viewport": VIEWPORT,
        "base_url": BASE_URL,
        "results": [],
    }

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport=VIEWPORT,
            reduced_motion="reduce",
            color_scheme="light",
            locale="ar-SA",
        )
        page = await ctx.new_page()
        # Deterministic clock helps eliminate time-based noise.
        await ctx.add_init_script(
            "Date.now = (() => { const t = new Date('2026-07-24T09:00:00Z').getTime();"
            " return () => t; })();"
        )

        for route in ROUTES:
            url = f"{BASE_URL}{route['path']}"
            entry = {"name": route["name"], "url": url}
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=20_000)
                try:
                    await page.wait_for_selector(route["wait_for"], timeout=8_000)
                except Exception:
                    pass
                # Give web fonts / hydration one frame.
                await page.wait_for_timeout(600)
                current = CURRENT_DIR / f"{route['name']}.png"
                await page.screenshot(path=str(current))
                entry["current"] = str(current)

                baseline = BASELINE_DIR / f"{route['name']}.png"
                if update_baseline:
                    baseline.write_bytes(current.read_bytes())
                    entry["status"] = "baseline_updated"
                elif baseline.exists():
                    diff_pct = diff_images(baseline, current, DIFF_DIR / f"{route['name']}.png")
                    entry["diff_percent"] = diff_pct
                    entry["baseline"] = str(baseline)
                    entry["diff"] = str(DIF_DIFF_PATH := DIFF_DIR / f"{route['name']}.png")
                    entry["status"] = "clean" if diff_pct < 0.5 else "changed"
                else:
                    entry["status"] = "no_baseline"
            except Exception as exc:
                entry["status"] = "error"
                entry["error"] = str(exc)

            report["results"].append(entry)
            print(f"[{entry['status']:>16}] {route['name']:<20} {entry.get('diff_percent','') }")

        await browser.close()

    return report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--update", action="store_true", help="Refresh baseline snapshots")
    ap.add_argument("--json", help="Write full JSON report to this path")
    args = ap.parse_args()

    report = asyncio.run(capture(args.update))
    if args.json:
        Path(args.json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json).write_text(json.dumps(report, indent=2))
        print(f"\nJSON report → {args.json}")

    if args.update:
        print("\nBaselines refreshed under scripts/design/visual-regression/baseline/")
        return 0

    changed = [r for r in report["results"] if r.get("status") == "changed"]
    missing = [r for r in report["results"] if r.get("status") == "no_baseline"]
    errors = [r for r in report["results"] if r.get("status") == "error"]

    print("")
    print(f"changed:      {len(changed)}")
    print(f"no_baseline:  {len(missing)}")
    print(f"errors:       {len(errors)}")

    # Exit non-zero on visible regressions or capture errors, not on missing baselines.
    return 1 if (changed or errors) else 0


if __name__ == "__main__":
    sys.exit(main())
