"""
A11y baseline scan — Playwright + axe-core CDN, no npm deps.
Runs against localhost dev server (port 8080) on top 12 public routes,
both AR (default) and EN. Writes a JSON + Markdown report under docs/audit/.

Usage:
  python3 tests/a11y/axe_baseline.py

Requirements:
  - Dev server running at http://localhost:8080
  - Playwright browsers pre-installed (already available in sandbox)

Exit code 0 always — this is a baseline, not a gate. Wire into CI as
non-blocking until the P0-2 remediation pass lands.
"""

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from playwright.async_api import async_playwright

ROUTES = [
    "/",
    "/about",
    "/doctors",
    "/branches",
    "/excellence",
    "/health",
    "/faq",
    "/contact",
    "/accreditations",
    "/book",
    "/emergency",
    "/auth",
]

LANGS = [
    ("ar", "rtl"),
    ("en", "ltr"),
]

AXE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js"

OUT_DIR = Path(__file__).resolve().parents[2] / "docs" / "audit"
OUT_DIR.mkdir(parents=True, exist_ok=True)


async def run() -> None:
    results: list[dict] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            for lang, direction in LANGS:
                context = await browser.new_context(
                    viewport={"width": 1280, "height": 1800},
                    locale=lang,
                )
                page = await context.new_page()
                for route in ROUTES:
                    url = f"http://localhost:8080{route}"
                    try:
                        await page.goto(url, wait_until="networkidle", timeout=25000)
                        # Force language via i18n cookie if the app reads one; noop otherwise.
                        await context.add_cookies([
                            {"name": "i18nextLng", "value": lang, "url": "http://localhost:8080"},
                        ])
                        await page.reload(wait_until="networkidle", timeout=25000)
                        await page.add_script_tag(url=AXE_CDN)
                        axe = await page.evaluate(
                            """async () => {
                                const r = await window.axe.run(document, {
                                    resultTypes: ['violations'],
                                    runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa','wcag22aa'] },
                                });
                                return r.violations.map(v => ({
                                    id: v.id, impact: v.impact, help: v.help,
                                    nodes: v.nodes.length,
                                }));
                            }"""
                        )
                        results.append({
                            "route": route, "lang": lang, "dir": direction,
                            "violations": axe, "ok": True,
                        })
                        print(f"[{lang}] {route}: {len(axe)} violation types")
                    except Exception as exc:  # noqa: BLE001
                        results.append({
                            "route": route, "lang": lang, "dir": direction,
                            "violations": [], "ok": False, "error": str(exc),
                        })
                        print(f"[{lang}] {route}: ERROR {exc}")
                await context.close()
        finally:
            await browser.close()

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    json_path = OUT_DIR / f"a11y-baseline-{ts}.json"
    json_path.write_text(json.dumps(results, ensure_ascii=False, indent=2))

    # Aggregate
    by_rule: dict[str, dict[str, int]] = {}
    total = 0
    for r in results:
        for v in r["violations"]:
            key = v["id"]
            bucket = by_rule.setdefault(key, {"impact": v.get("impact") or "unknown", "count": 0, "nodes": 0, "help": v["help"]})
            bucket["count"] += 1
            bucket["nodes"] += v["nodes"]
            total += v["nodes"]

    md = [f"# A11y Baseline — {ts}", ""]
    md.append(f"Routes scanned: {len(ROUTES)} × {len(LANGS)} langs = {len(results)} runs.")
    md.append(f"Total violating nodes: **{total}**.")
    md.append("")
    md.append("## Violations by rule (aggregated)")
    md.append("")
    md.append("| Rule | Impact | Route hits | Node hits | Help |")
    md.append("|---|---|---:|---:|---|")
    for rule, b in sorted(by_rule.items(), key=lambda kv: -kv[1]["nodes"]):
        md.append(f"| `{rule}` | {b['impact']} | {b['count']} | {b['nodes']} | {b['help']} |")
    if not by_rule:
        md.append("| — | — | 0 | 0 | ✅ no violations detected |")

    md.append("")
    md.append("## Per-route summary")
    md.append("")
    md.append("| Lang | Route | Rules | Status |")
    md.append("|---|---|---:|---|")
    for r in results:
        status = "ok" if r["ok"] else f"error: {r.get('error','')[:60]}"
        md.append(f"| {r['lang']} | `{r['route']}` | {len(r['violations'])} | {status} |")

    md_path = OUT_DIR / f"a11y-baseline-{ts}.md"
    md_path.write_text("\n".join(md), encoding="utf-8")
    print(f"\nReport: {md_path}\nJSON:   {json_path}")


if __name__ == "__main__":
    asyncio.run(run())
