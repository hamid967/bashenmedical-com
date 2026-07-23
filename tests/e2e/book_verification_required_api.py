"""
E2E: بوابة التحقق من الجوال في /api/public/book/create.

يتحقّق من أن الخادم يرفض أي حجز بدون challenge صالح ومُستهلَك حديثًا:

  1. غياب verification_challenge_id  → 400 VERIFICATION_REQUIRED
  2. verification_challenge_id بصيغة UUID غير صالحة → 400 (Zod validation)
  3. UUID صالح شكلًا لكنه غير موجود في otp_challenges → 400 VERIFICATION_REQUIRED
  4. null صريح → 400 VERIFICATION_REQUIRED

هذه الفحوصات لا تحتاج جلسة Supabase؛ تعتمد فقط على استجابة الـHTTP.

Env:
  E2E_BASE_URL — الافتراضي http://localhost:8080

التشغيل:
  python3 tests/e2e/book_verification_required_api.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080").rstrip("/")
ENDPOINT = "/api/public/book/create"

FAILED: list[str] = []


def post(payload: dict, headers: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(payload).encode("utf-8")
    hdrs = {"Content-Type": "application/json", "Accept": "application/json"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(f"{BASE}{ENDPOINT}", data=data, method="POST", headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
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


def base_body(**overrides) -> dict:
    body = {
        "patient_name": "اختبار المريض",
        "patient_phone": "0501234567",
        "patient_email": "",
        "national_id": None,
        "gender": "male",
        "doctor_id": str(uuid.uuid4()),
        "branch_id": str(uuid.uuid4()),
        "specialty_id": str(uuid.uuid4()),
        "appointment_date": "2030-01-15",
        "appointment_time": "10:00",
        "reason": None,
    }
    body.update(overrides)
    return body


def expect_verification_required(label: str, status: int, body: dict) -> None:
    detail = f"status={status} body={json.dumps(body, ensure_ascii=False)[:200]}"
    check(f"{label} → 400", status == 400, detail)
    check(
        f"{label} ok:false",
        isinstance(body, dict) and body.get("ok") is False,
        detail,
    )
    check(
        f"{label} code=VERIFICATION_REQUIRED",
        body.get("code") == "VERIFICATION_REQUIRED",
        detail,
    )


def test_missing_challenge() -> None:
    print("== 1) missing verification_challenge_id ==")
    body = base_body()  # no verification_challenge_id at all
    s, b = post(body)
    expect_verification_required("missing", s, b)


def test_null_challenge() -> None:
    print("== 2) null verification_challenge_id ==")
    s, b = post(base_body(verification_challenge_id=None))
    expect_verification_required("null", s, b)


def test_malformed_challenge() -> None:
    print("== 3) malformed (non-UUID) verification_challenge_id ==")
    s, b = post(base_body(verification_challenge_id="not-a-uuid"))
    detail = f"status={s} body={json.dumps(b, ensure_ascii=False)[:200]}"
    check("malformed → 400", s == 400, detail)
    check(
        "malformed kind=validation",
        isinstance(b, dict) and b.get("ok") is False and b.get("kind") == "validation",
        detail,
    )


def test_unknown_challenge() -> None:
    print("== 4) valid UUID but no matching otp_challenges row ==")
    s, b = post(base_body(verification_challenge_id=str(uuid.uuid4())))
    expect_verification_required("unknown-uuid", s, b)


def test_wrong_purpose_shape() -> None:
    # Nil UUID is syntactically valid but never issued by the OTP service.
    # Ensures the server rejects even "well-known" placeholder IDs.
    print("== 5) nil-UUID placeholder ==")
    s, b = post(base_body(verification_challenge_id="00000000-0000-4000-8000-000000000000"))
    expect_verification_required("nil-uuid", s, b)


def main() -> None:
    print(f"BASE={BASE}\n")
    test_missing_challenge()
    test_null_challenge()
    test_malformed_challenge()
    test_unknown_challenge()
    test_wrong_purpose_shape()
    print()
    if FAILED:
        print(f"❌ {len(FAILED)} فحص فشل:")
        for f in FAILED:
            print(f"   - {f}")
        sys.exit(1)
    print("✅ بوابة التحقق من OTP في /book/create تعمل كما هو متوقّع.")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        import traceback

        traceback.print_exc()
        print(f"\n!! خطأ غير متوقّع: {e}", file=sys.stderr)
        sys.exit(2)
