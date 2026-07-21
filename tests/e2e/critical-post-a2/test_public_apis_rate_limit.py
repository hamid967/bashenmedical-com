"""
Post-A2: /api/public/book/hold و /api/public/inquiries/create يستجيبان
(200 مسار سعيد أو 400 تحقّق مدخلات، وليس 500/permission denied).
"""
import asyncio, json, os
import urllib.request, urllib.error
from _shared import BASE


def post_json(path: str, body: dict) -> tuple[int, str]:
    req = urllib.request.Request(
        f"{BASE}{path}", data=json.dumps(body).encode(),
        method="POST", headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="ignore")


def main():
    failures = []
    # مدخلات فارغة عمداً — الهدف رصد 5xx / permission denied فقط.
    for path in ("/api/public/book/hold", "/api/public/inquiries/create"):
        code, body = post_json(path, {})
        low = body.lower()
        if code >= 500 or "permission denied" in low:
            failures.append({"path": path, "code": code, "body": body[:300]})
    if failures:
        raise SystemExit(f"post-A2 API failures: {json.dumps(failures, indent=2)}")
    print("[ok] public APIs respond without 5xx/permission denied")


if __name__ == "__main__":
    main()
