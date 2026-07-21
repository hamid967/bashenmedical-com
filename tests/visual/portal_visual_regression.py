"""
Visual regression tests for the patient portal after Design Tokens v2 migration.

يلتقط لقطات للصفحات المفتاحية في `portal/*` ويقارنها ببصمات مرجعية
مُسجَّلة تحت `tests/visual/baselines/`. أي انحراف بصري يزيد عن العتبة
يعني أن ترحيل tokens (أو أي تعديل UI لاحق) كسر المظهر.

الاستخدام:
    # المرة الأولى (تسجيل baselines من فرع أخضر):
    UPDATE_BASELINES=1 python3 tests/visual/portal_visual_regression.py

    # المرة اللاحقة (مقارنة):
    python3 tests/visual/portal_visual_regression.py

مصادر الجلسة (بنفس نمط admin_opens_for_admin_user.py):
  1) E2E_PATIENT_EMAIL + E2E_PATIENT_PASSWORD  → password sign-in (CI)
  2) LOVABLE_BROWSER_SUPABASE_* المُحقنة في السَّندبوكس
  3) إن غاب الاثنان → skip clean.

قواعد استقرار اللقطة:
  - viewport ثابت 1280×1800.
  - تعطيل جميع الحركات/الانتقالات عبر CSS.
  - تجميد Date.now و Math.random لجعل أي "منذ ٥ دقائق" مستقر.
  - انتظار networkidle + selector رئيسي قبل اللقطة.
  - قناع dynamic content عبر `[data-visual-mask]` (نُخفيها بالكامل).

Exit codes: 0 = pass أو skip، 1 = فشل مقارنة، 2 = خطأ إعداد.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

from playwright.async_api import async_playwright

# ————————————————— إعدادات عامة —————————————————
BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
SUPA_URL = "https://rcerbsywuovcleqybumg.supabase.co"
SUPA_KEY = "sb_publishable_jCNv8mbgtiQaIWkms_cHiA_9WUH_qEG"
PROJECT_REF = "rcerbsywuovcleqybumg"
DEFAULT_STORAGE_KEY = f"sb-{PROJECT_REF}-auth-token"

ROOT = Path(__file__).parent
BASELINE_DIR = ROOT / "baselines"
DIFF_DIR = ROOT / "diffs"
BASELINE_DIR.mkdir(exist_ok=True)
DIFF_DIR.mkdir(exist_ok=True)

UPDATE = os.environ.get("UPDATE_BASELINES") == "1"
# نسبة البكسلات المختلفة المسموحة (0.5% افتراضياً — يكفي للـanti-aliasing).
PIXEL_TOLERANCE = float(os.environ.get("VISUAL_PIXEL_TOLERANCE", "0.005"))
# الفرق اللوني لكل قناة (0-255) الذي نعتبره "اختلاف بكسل حقيقي".
CHANNEL_TOLERANCE = int(os.environ.get("VISUAL_CHANNEL_TOLERANCE", "8"))

PATIENT_EMAIL = os.environ.get("E2E_PATIENT_EMAIL", "").strip()
PATIENT_PASSWORD = os.environ.get("E2E_PATIENT_PASSWORD", "").strip()
AUTH_STATUS = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "")
INJECTED_SESSION_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON", "")
INJECTED_STORAGE_KEY = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY", "")
INJECTED_COOKIES_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON", "")

# قائمة الصفحات + selector يجب أن يظهر قبل اللقطة (يضمن اكتمال التحميل).
PAGES: list[tuple[str, str, str]] = [
    ("portal-index", "/portal", "main"),
    ("portal-dashboard", "/portal/dashboard", "main"),
    ("portal-appointments", "/portal/appointments", "main"),
    ("portal-doctors", "/portal/doctors", "main"),
    ("portal-family", "/portal/family", "main"),
    ("portal-invoices", "/portal/invoices", "main"),
    ("portal-records", "/portal/records", "main"),
    ("portal-profile", "/portal/profile", "main"),
    ("portal-settings", "/portal/settings", "main"),
    ("portal-consents", "/portal/consents", "main"),
]

# CSS يُحقن قبل اللقطة: يوقف الحركات ويخفي أي عنصر يريد المطور استثناءه.
FREEZE_CSS = """
*, *::before, *::after {
  transition: none !important;
  animation: none !important;
  caret-color: transparent !important;
}
html { scroll-behavior: auto !important; }
[data-visual-mask] { visibility: hidden !important; }
/* أخفِ عناصر شائعة متغيرة الوقت */
[data-portal-timestamp], time[datetime] { color: transparent !important; }
"""

# JS يُحقن قبل تحميل أي سكربت: يجمّد الوقت/العشوائية.
FREEZE_JS = """
(() => {
  const FIXED = new Date('2026-01-15T09:00:00.000Z').getTime();
  const _Date = Date;
  function StubDate(...args) {
    if (args.length === 0) return new _Date(FIXED);
    return new _Date(...args);
  }
  StubDate.prototype = _Date.prototype;
  StubDate.now = () => FIXED;
  StubDate.parse = _Date.parse;
  StubDate.UTC = _Date.UTC;
  // @ts-ignore
  window.Date = StubDate;
  let seed = 1;
  Math.random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
})();
"""


# ————————————————— جلسة Supabase —————————————————
def password_sign_in(email: str, password: str) -> dict:
    req = urllib.request.Request(
        f"{SUPA_URL}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"apikey": SUPA_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        raw = urllib.request.urlopen(req).read()
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="ignore")
        raise RuntimeError(
            f"password sign-in failed for {email!r}: HTTP {e.code} — {body}"
        ) from e
    data = json.loads(raw)
    return {
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "expires_in": data.get("expires_in", 3600),
        "expires_at": data.get("expires_at"),
        "token_type": data.get("token_type", "bearer"),
        "user": data["user"],
    }


def resolve_session() -> tuple[dict | None, str, list | None, str]:
    if PATIENT_EMAIL and PATIENT_PASSWORD:
        s = password_sign_in(PATIENT_EMAIL, PATIENT_PASSWORD)
        return s, DEFAULT_STORAGE_KEY, None, "ci-password"
    if AUTH_STATUS == "injected" and INJECTED_SESSION_JSON:
        try:
            s = json.loads(INJECTED_SESSION_JSON)
        except Exception:
            return None, "", None, "injected-broken"
        cookies = None
        if INJECTED_COOKIES_JSON:
            try:
                cookies = json.loads(INJECTED_COOKIES_JSON)
            except Exception:
                cookies = None
        return s, INJECTED_STORAGE_KEY or DEFAULT_STORAGE_KEY, cookies, "injected"
    return None, "", None, "none"


# ————————————————— مقارنة الصور —————————————————
def compare_png(actual: Path, baseline: Path) -> tuple[float, Path | None]:
    """يرجع (نسبة الاختلاف، مسار الـdiff إن أُنشئ). يستخدم PIL فقط."""
    from PIL import Image, ImageChops

    a = Image.open(actual).convert("RGB")
    b = Image.open(baseline).convert("RGB")
    if a.size != b.size:
        return 1.0, None

    diff = ImageChops.difference(a, b)
    # اعتبر أي بكسل يتجاوز CHANNEL_TOLERANCE في أي قناة اختلافاً حقيقياً.
    bbox_pixels = 0
    total = a.size[0] * a.size[1]
    px = diff.load()
    changed_map = Image.new("1", a.size, 0)
    cm_px = changed_map.load()
    w, h = a.size
    for y in range(h):
        for x in range(w):
            r, g, bl = px[x, y]
            if r > CHANNEL_TOLERANCE or g > CHANNEL_TOLERANCE or bl > CHANNEL_TOLERANCE:
                bbox_pixels += 1
                cm_px[x, y] = 1
    ratio = bbox_pixels / total if total else 0.0
    diff_path = None
    if ratio > 0:
        diff_path = DIFF_DIR / f"{actual.stem}.diff.png"
        # حفظ diff مضخّم للرؤية
        Image.eval(diff, lambda v: min(255, v * 8)).save(diff_path)
    return ratio, diff_path


# ————————————————— التنفيذ —————————————————
async def snapshot_and_compare(page, slug: str, path: str, ready_selector: str) -> dict:
    """يرجع dict بحالة الصفحة: status ∈ {ok, baseline, fail, error}, ratio, paths."""
    url = f"{BASE}{path}"
    record: dict = {"slug": slug, "path": path, "url": url, "status": "ok", "ratio": 0.0}
    await page.goto(url, wait_until="domcontentloaded")
    try:
        await page.wait_for_selector(ready_selector, timeout=15_000)
    except Exception:
        record.update(status="error", error=f"selector '{ready_selector}' لم يظهر خلال 15s")
        return record

    try:
        await page.wait_for_load_state("networkidle", timeout=8_000)
    except Exception:
        pass
    await page.add_style_tag(content=FREEZE_CSS)
    await page.wait_for_timeout(300)

    actual_path = DIFF_DIR / f"{slug}.actual.png"
    await page.screenshot(path=str(actual_path), full_page=False)

    baseline_path = BASELINE_DIR / f"{slug}.png"
    if UPDATE or not baseline_path.exists():
        actual_path.replace(baseline_path)
        print(f"[baseline] wrote {baseline_path.name}")
        record.update(status="baseline", baseline=str(baseline_path))
        return record

    ratio, diff_path = compare_png(actual_path, baseline_path)
    record["ratio"] = ratio
    record["baseline"] = str(baseline_path)
    record["actual"] = str(actual_path)
    if diff_path:
        record["diff"] = str(diff_path)
    if ratio > PIXEL_TOLERANCE:
        record["status"] = "fail"
        print(f"[fail] {slug}: انحراف {ratio:.4%} > {PIXEL_TOLERANCE:.2%}")
    else:
        print(f"[ok] {slug}: انحراف {ratio:.4%} ≤ {PIXEL_TOLERANCE:.2%}")
        actual_path.unlink(missing_ok=True)
    return record


# ————————————————— توليد التقرير —————————————————
REPORT_DIR = Path(os.environ.get("VISUAL_REPORT_DIR", "/mnt/documents/visual-regression"))


def _b64(p: Path) -> str:
    import base64
    return base64.b64encode(p.read_bytes()).decode()


def write_report(results: list[dict]) -> Path | None:
    """يبني تقرير HTML مفصّل ويُصدر JSON مرافق. يُنشأ فقط عند وجود فروق/أخطاء/baselines جديدة."""
    interesting = [r for r in results if r["status"] in ("fail", "error", "baseline")]
    fails = sum(1 for r in results if r["status"] == "fail")
    errors = sum(1 for r in results if r["status"] == "error")
    baselines = sum(1 for r in results if r["status"] == "baseline")
    if not interesting and not fails:
        return None

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    ts = __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H-%M-%SZ")

    # JSON summary
    summary = {
        "generated_at_utc": ts,
        "base_url": BASE,
        "tolerance": PIXEL_TOLERANCE,
        "channel_tolerance": CHANNEL_TOLERANCE,
        "totals": {
            "checked": len(results),
            "ok": sum(1 for r in results if r["status"] == "ok"),
            "fail": fails,
            "error": errors,
            "baseline_written": baselines,
        },
        "results": [{k: v for k, v in r.items() if k not in {"baseline", "actual", "diff"} or True} for r in results],
    }
    (REPORT_DIR / "report.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    def _img(label: str, p: str | None) -> str:
        if not p or not Path(p).exists():
            return f'<div class="img missing">لا يوجد {label}</div>'
        return f'<figure><figcaption>{label}</figcaption><img alt="{label}" src="data:image/png;base64,{_b64(Path(p))}"/></figure>'

    rows = []
    for r in results:
        status = r["status"]
        badge_class = {"ok": "ok", "fail": "fail", "error": "err", "baseline": "new"}[status]
        badge_text = {"ok": "مطابق", "fail": "فرق بصري", "error": "خطأ", "baseline": "baseline جديد"}[status]
        ratio_txt = f"{r.get('ratio', 0):.4%}" if status in ("ok", "fail") else "—"
        details = ""
        if status in ("fail", "baseline"):
            details = f"""
            <div class="triptych">
              {_img("Baseline (القديم)", r.get("baseline"))}
              {_img("Actual (الجديد)", r.get("actual") or r.get("baseline"))}
              {_img("Diff (الفروقات)", r.get("diff"))}
            </div>"""
        elif status == "error":
            details = f'<p class="err-msg">⚠ {r.get("error", "خطأ غير معروف")}</p>'
        rows.append(f"""
        <section class="row {badge_class}">
          <header>
            <span class="badge {badge_class}">{badge_text}</span>
            <h2>{r["slug"]}</h2>
            <code>{r["path"]}</code>
            <span class="ratio">{ratio_txt}</span>
          </header>
          {details}
        </section>""")

    verdict_class = "fail" if fails or errors else ("new" if baselines else "ok")
    verdict_text = (
        f"❌ فشل: {fails} صفحة تجاوزت العتبة" if fails
        else f"⚠ أخطاء تنفيذ في {errors} صفحة" if errors and not baselines
        else f"🆕 كُتب {baselines} baseline جديد"
    )

    html = f"""<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8"/>
<title>Visual Regression Report — Portal</title>
<style>
  :root {{ --ok:#16A34A; --fail:#C0392B; --new:#0B8585; --err:#D97706; --ink:#173B42; --bg:#FCFDFB; --border:#DCEAE8; }}
  body {{ font-family: -apple-system, "Segoe UI", "Tajawal", sans-serif; background: var(--bg); color: var(--ink); margin:0; padding:24px; }}
  h1 {{ margin:0 0 4px 0; font-size:22px; }}
  .meta {{ color:#5A6E73; font-size:13px; margin-bottom:20px; }}
  .verdict {{ display:inline-block; padding:8px 16px; border-radius:999px; font-weight:700; margin-bottom:24px; color:#fff; }}
  .verdict.ok {{ background:var(--ok); }} .verdict.fail {{ background:var(--fail); }}
  .verdict.new {{ background:var(--new); }} .verdict.err {{ background:var(--err); }}
  .row {{ background:#fff; border:1px solid var(--border); border-radius:16px; padding:16px; margin-bottom:16px; box-shadow:0 1px 2px rgba(7,94,99,.05); }}
  .row header {{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; }}
  .row h2 {{ margin:0; font-size:16px; }}
  .row code {{ color:#5A6E73; font-size:13px; }}
  .ratio {{ margin-inline-start:auto; font-variant-numeric:tabular-nums; font-weight:600; }}
  .badge {{ padding:4px 10px; border-radius:999px; font-size:12px; font-weight:700; color:#fff; }}
  .badge.ok {{ background:var(--ok); }} .badge.fail {{ background:var(--fail); }}
  .badge.new {{ background:var(--new); }} .badge.err {{ background:var(--err); }}
  .triptych {{ display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:14px; }}
  figure {{ margin:0; border:1px solid var(--border); border-radius:12px; overflow:hidden; background:#F7FAF9; }}
  figcaption {{ font-size:12px; font-weight:600; padding:8px 10px; background:#EEF6F5; border-bottom:1px solid var(--border); }}
  figure img {{ display:block; width:100%; height:auto; }}
  .img.missing {{ padding:20px; text-align:center; color:#7A8A8E; font-size:13px; }}
  .err-msg {{ color:var(--fail); font-weight:600; margin:12px 0 0; }}
  summary {{ cursor:pointer; }}
</style></head><body>
  <h1>Portal — Visual Regression Report</h1>
  <div class="meta">
    UTC: {ts} · Base: <code>{BASE}</code> ·
    Tolerance: {PIXEL_TOLERANCE:.2%} · Channel: {CHANNEL_TOLERANCE}
  </div>
  <div class="verdict {verdict_class}">{verdict_text}</div>
  <p class="meta">فُحصت {len(results)} صفحة — ✅ {summary["totals"]["ok"]} مطابقة، ❌ {fails} فرق، ⚠ {errors} خطأ، 🆕 {baselines} baseline جديد.</p>
  {"".join(rows)}
</body></html>"""
    report_path = REPORT_DIR / "report.html"
    report_path.write_text(html, encoding="utf-8")
    # نسخة مؤرَّخة للأرشيف
    (REPORT_DIR / f"report-{ts}.html").write_text(html, encoding="utf-8")
    print(f"[report] {report_path}")
    return report_path


async def main() -> int:
    session, storage_key, cookies, source = resolve_session()
    if session is None:
        print(
            "[skip] لا توجد جلسة مريض. زوّد E2E_PATIENT_EMAIL و E2E_PATIENT_PASSWORD "
            "أو شغّل الاختبار داخل السَّندبوكس مع جلسة مُحقنة."
        )
        return 0

    print(f"[info] source={source} storage_key={storage_key} update={UPDATE}")
    print(f"[info] base={BASE} tolerance={PIXEL_TOLERANCE:.2%} channel={CHANNEL_TOLERANCE}")

    results: list[dict] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 1280, "height": 1800},
            locale="ar-SA",
            device_scale_factor=1,
            reduced_motion="reduce",
        )
        await ctx.add_init_script(FREEZE_JS)

        if cookies:
            for c in cookies:
                c["url"] = BASE
            await ctx.add_cookies(cookies)

        page = await ctx.new_page()
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(json.dumps(session))})"
        )

        for slug, path, ready in PAGES:
            try:
                results.append(await snapshot_and_compare(page, slug, path, ready))
            except Exception as e:  # noqa: BLE001
                results.append({"slug": slug, "path": path, "status": "error", "error": f"{type(e).__name__}: {e}"})

        await browser.close()

    report_path = write_report(results)
    fails = [r for r in results if r["status"] == "fail"]
    errors = [r for r in results if r["status"] == "error"]

    if fails or errors:
        print("\n=== FAILURES ===")
        for r in fails + errors:
            print(f"[{r['status']}] {r['slug']}: {r.get('error', f'ratio={r.get('ratio', 0):.4%}')}")
        if report_path:
            print(f"\n📄 التقرير: {report_path}")
        print(
            "إن كان الاختلاف مقصوداً بعد ترحيل tokens، حدّث المرجع:\n"
            "    UPDATE_BASELINES=1 python3 tests/visual/portal_visual_regression.py"
        )
        return 1

    if report_path:
        print(f"\n📄 التقرير (baselines جديدة): {report_path}")
    print("\n[ok] كل الصفحات مطابقة للـbaselines ضمن العتبة.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except RuntimeError as e:
        print(f"[error] {e}")
        sys.exit(2)

