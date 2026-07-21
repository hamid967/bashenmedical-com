"""
مساعدات مشتركة لاختبارات critical-post-a2:
  * BASE URL الموحّد
  * جمع رسائل خطأ الشبكة (permission denied for function ...) لرصد أثر REVOKE
  * session injection لحسابات E2E (patient/admin) بدل تسجيل الدخول عبر UI

يعتمد على tests/e2e/_helpers.py القائم (retries + artifacts).
"""
from __future__ import annotations
import json, os, sys, time
from pathlib import Path
from typing import Awaitable, Callable

# نُدرج جذر tests/e2e لاستيراد _helpers.py الموجود مسبقاً
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _helpers import (  # noqa: E402
    make_recording_context, retry_async, finalize_context, ART_ROOT,
)

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")


def _perm_denied(text: str) -> bool:
    if not text:
        return False
    low = text.lower()
    return "permission denied for function" in low or "permission denied for relation" in low


class PermDeniedProbe:
    """يلتقط استجابات fetch لرصد أخطاء صلاحيات دوال Postgres بعد A2."""

    def __init__(self):
        self.hits: list[dict] = []

    def attach(self, page):
        async def on_response(res):
            try:
                if res.status >= 400 and "supabase" in res.url:
                    body = await res.text()
                    if _perm_denied(body):
                        self.hits.append({
                            "url": res.url, "status": res.status,
                            "body": body[:500],
                        })
            except Exception:
                pass
        page.on("response", lambda r: __import__("asyncio").create_task(on_response(r)))

    def assert_clean(self):
        assert not self.hits, (
            f"post-A2 permission errors detected ({len(self.hits)}):\n"
            + json.dumps(self.hits, indent=2, ensure_ascii=False)
        )


async def inject_supabase_session(page, storage_key: str | None = None,
                                   session_json: str | None = None):
    """يحقن جلسة Supabase المُهيّأة من متغيّرات البيئة (لطاقم CI)."""
    sk = storage_key or os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    sj = session_json or os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if not sk or not sj:
        return False
    await page.goto(BASE)
    await page.evaluate(
        f"window.localStorage.setItem({json.dumps(sk)}, {json.dumps(sj)})"
    )
    return True


async def sign_in_via_supabase(page, email: str, password: str,
                                anon_key: str, url: str):
    """يسجّل دخول برمجياً عبر Supabase Auth REST ثم يزرع الجلسة."""
    import urllib.request, urllib.error
    body = json.dumps({"email": email, "password": password}).encode()
    req = urllib.request.Request(
        f"{url.rstrip('/')}/auth/v1/token?grant_type=password",
        data=body, method="POST",
        headers={"apikey": anon_key, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as res:
        session = json.loads(res.read().decode())
    project_ref = url.rstrip("/").split("//")[-1].split(".")[0]
    storage_key = f"sb-{project_ref}-auth-token"
    await page.goto(BASE)
    await page.evaluate(
        f"window.localStorage.setItem({json.dumps(storage_key)}, "
        f"{json.dumps(json.dumps(session))})"
    )
    return session
