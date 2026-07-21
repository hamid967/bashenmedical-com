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
async def snapshot_and_compare(page, slug: str, path: str, ready_selector: str) -> str | None:
    url = f"{BASE}{path}"
    await page.goto(url, wait_until="domcontentloaded")
    try:
        await page.wait_for_selector(ready_selector, timeout=15_000)
    except Exception:
        return f"{slug}: selector '{ready_selector}' لم يظهر خلال 15s ({url})"

    # انتظر السكون الشبكي القصير + inject freezing CSS
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
        return None

    ratio, diff_path = compare_png(actual_path, baseline_path)
    if ratio > PIXEL_TOLERANCE:
        return (
            f"{slug}: انحراف بصري {ratio:.4%} > عتبة {PIXEL_TOLERANCE:.2%} "
            f"(baseline={baseline_path.name}, actual={actual_path.name}, diff={diff_path.name if diff_path else '—'})"
        )
    print(f"[ok] {slug}: انحراف {ratio:.4%} ≤ {PIXEL_TOLERANCE:.2%}")
    # نظّف الـactual الناجح لتقليل الضوضاء
    actual_path.unlink(missing_ok=True)
    return None


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

        failures: list[str] = []
        for slug, path, ready in PAGES:
            try:
                err = await snapshot_and_compare(page, slug, path, ready)
                if err:
                    failures.append(err)
            except Exception as e:  # noqa: BLE001
                failures.append(f"{slug}: exception {type(e).__name__}: {e}")

        await browser.close()

    if failures:
        print("\n=== FAILURES ===")
        for f in failures:
            print(f"[fail] {f}")
        print(
            f"\nإن كان الاختلاف مقصوداً بعد ترحيل tokens، حدّث المرجع:\n"
            f"    UPDATE_BASELINES=1 python3 {Path(__file__).relative_to(Path.cwd()) if Path(__file__).is_absolute() else __file__}"
        )
        return 1

    print("\n[ok] كل الصفحات مطابقة للـbaselines ضمن العتبة.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except RuntimeError as e:
        print(f"[error] {e}")
        sys.exit(2)
