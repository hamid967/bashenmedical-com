"""
E2E: تحقق Zod يرجّع 400 واضحة عند مدخلات غير صحيحة لـ:

  • GET /api/public/book/availability
  • GET /api/public/book/month-availability
  • GET /api/public/book/resolve-any-doctor

لا يحتاج Supabase — يعتمد فقط على استجابة الـHTTP.

Env:
  E2E_BASE_URL — الافتراضي http://localhost:8080

التشغيل:
  python3 tests/e2e/book_public_api_zod_validation.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")

FAILED: list[str] = []


def get(path: str, query: dict) -> tuple[int, dict]:
    url = f"{BASE}{path}?{urllib.parse.urlencode(query)}"
    req = urllib.request.Request(url, method="GET", headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read().decode("utf-8", "replace")
            status = r.status
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        status = e.code
    try:
        return status, json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return status, {"_raw": raw[:200]}


def check(label: str, ok: bool, detail: str = "") -> None:
    mark = "✅" if ok else "❌"
    print(f"  {mark} {label}" + (f"  — {detail}" if detail else ""))
    if not ok:
        FAILED.append(label)


def expect_400(label: str, status: int, body: dict, want_error_needle: str | None = None) -> None:
    ok_status = status == 400
    ok_shape = isinstance(body, dict) and body.get("ok") is False and isinstance(body.get("error"), str)
    detail = f"status={status} body={json.dumps(body, ensure_ascii=False)[:180]}"
    check(f"{label} → 400", ok_status, detail)
    check(f"{label} shape {{ok:false,error:string}}", ok_shape, detail)
    if want_error_needle is not None and ok_shape:
        check(
            f"{label} error='{want_error_needle}'",
            want_error_needle in str(body.get("error", "")),
            f"error={body.get('error')!r}",
        )


VALID_UUID = "00000000-0000-4000-8000-000000000000"


def test_availability() -> None:
    print("== /availability — Zod validation ==")
    # missing date
    s, b = get("/api/public/book/availability", {"doctor_id": VALID_UUID})
    expect_400("A1 missing date", s, b)
    # malformed date
    s, b = get("/api/public/book/availability", {"date": "2026/07/23", "doctor_id": VALID_UUID})
    expect_400("A2 malformed date", s, b, "invalid_date")
    # invalid doctor_id UUID
    s, b = get("/api/public/book/availability", {"date": "2026-07-23", "doctor_id": "not-a-uuid"})
    expect_400("A3 invalid doctor_id", s, b, "invalid_doctor_id")
    # invalid specialty_id UUID
    s, b = get("/api/public/book/availability", {"date": "2026-07-23", "specialty_id": "xxx"})
    expect_400("A4 invalid specialty_id", s, b, "invalid_specialty_id")
    # invalid branch_id UUID
    s, b = get(
        "/api/public/book/availability",
        {"date": "2026-07-23", "doctor_id": VALID_UUID, "branch_id": "nope"},
    )
    expect_400("A5 invalid branch_id", s, b, "invalid_branch_id")
    # missing scope (no doctor and no specialty)
    s, b = get("/api/public/book/availability", {"date": "2026-07-23"})
    expect_400("A6 missing scope", s, b, "missing_scope")


def test_month_availability() -> None:
    print("\n== /month-availability — Zod validation ==")
    # missing year
    s, b = get("/api/public/book/month-availability", {"month": "7", "doctor_id": VALID_UUID})
    expect_400("M1 missing year", s, b)
    # year out of range
    s, b = get(
        "/api/public/book/month-availability",
        {"year": "1999", "month": "7", "doctor_id": VALID_UUID},
    )
    expect_400("M2 year<2000", s, b)
    s, b = get(
        "/api/public/book/month-availability",
        {"year": "2200", "month": "7", "doctor_id": VALID_UUID},
    )
    expect_400("M3 year>2100", s, b)
    # month out of range
    s, b = get(
        "/api/public/book/month-availability",
        {"year": "2026", "month": "13", "doctor_id": VALID_UUID},
    )
    expect_400("M4 month>12", s, b)
    s, b = get(
        "/api/public/book/month-availability",
        {"year": "2026", "month": "0", "doctor_id": VALID_UUID},
    )
    expect_400("M5 month<1", s, b)
    # non-numeric year
    s, b = get(
        "/api/public/book/month-availability",
        {"year": "abc", "month": "7", "doctor_id": VALID_UUID},
    )
    expect_400("M6 non-numeric year", s, b)
    # invalid uuids
    s, b = get(
        "/api/public/book/month-availability",
        {"year": "2026", "month": "7", "doctor_id": "nope"},
    )
    expect_400("M7 invalid doctor_id", s, b)
    # missing scope
    s, b = get("/api/public/book/month-availability", {"year": "2026", "month": "7"})
    expect_400("M8 missing scope", s, b, "missing_scope")


def test_resolve_any_doctor() -> None:
    print("\n== /resolve-any-doctor — Zod validation ==")
    # missing everything
    s, b = get("/api/public/book/resolve-any-doctor", {})
    expect_400("R1 empty", s, b)
    # malformed date
    s, b = get(
        "/api/public/book/resolve-any-doctor",
        {"date": "23-07-2026", "time": "10:00", "specialty_id": VALID_UUID},
    )
    expect_400("R2 malformed date", s, b, "invalid_date")
    # malformed time
    s, b = get(
        "/api/public/book/resolve-any-doctor",
        {"date": "2026-07-23", "time": "10-00", "specialty_id": VALID_UUID},
    )
    expect_400("R3 malformed time", s, b, "invalid_time")
    # invalid specialty uuid → schema tags as missing_scope
    s, b = get(
        "/api/public/book/resolve-any-doctor",
        {"date": "2026-07-23", "time": "10:00", "specialty_id": "not-a-uuid"},
    )
    expect_400("R4 invalid specialty_id", s, b, "missing_scope")
    # invalid branch uuid
    s, b = get(
        "/api/public/book/resolve-any-doctor",
        {
            "date": "2026-07-23",
            "time": "10:00",
            "specialty_id": VALID_UUID,
            "branch_id": "nope",
        },
    )
    expect_400("R5 invalid branch_id", s, b, "invalid_branch_id")
    # missing specialty (required)
    s, b = get(
        "/api/public/book/resolve-any-doctor",
        {"date": "2026-07-23", "time": "10:00"},
    )
    expect_400("R6 missing specialty_id", s, b)


def main() -> None:
    print(f"BASE={BASE}\n")
    test_availability()
    test_month_availability()
    test_resolve_any_doctor()
    print()
    if FAILED:
        print(f"❌ {len(FAILED)} فحص فشل:")
        for f in FAILED:
            print(f"   - {f}")
        sys.exit(1)
    print("✅ جميع سيناريوهات Zod (400) نجحت.")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        import traceback

        traceback.print_exc()
        print(f"\n!! خطأ غير متوقع: {e}", file=sys.stderr)
        sys.exit(2)
