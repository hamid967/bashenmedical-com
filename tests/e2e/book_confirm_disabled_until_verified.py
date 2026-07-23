"""
E2E (static-source guard): يضمن بقاء زر "تأكيد الحجز" في StepReview
معطّلًا حتى يكتمل التحقق من رقم الجوال عبر OTP.

نتحقق من:
  1. أن StepReview يستورد BookingPhoneVerification.
  2. أن قيمة phoneVerified مبنية على verificationChallengeId + verifiedPhone
     مطابقًا لهاتف المريض.
  3. أن Button الـConfirm يحمل disabled=... !phoneVerified ضمن الشرط.
  4. أن book.tsx يمرّر verification_challenge_id في جسم طلب /book/create.

هذا الاختبار سريع ومستقر — لا يعتمد على تشغيل المتصفح — ويكتشف أي انحدار
في بوابة التحقق قبل الوصول لطبقة الشبكة.

التشغيل:
  python3 tests/e2e/book_confirm_disabled_until_verified.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STEP_REVIEW = ROOT / "src/components/booking/StepReview.tsx"
BOOK_ROUTE = ROOT / "src/routes/book.tsx"

FAILED: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    mark = "✅" if ok else "❌"
    print(f"  {mark} {label}" + (f"  — {detail}" if detail else ""))
    if not ok:
        FAILED.append(label)


def main() -> None:
    sr = STEP_REVIEW.read_text(encoding="utf-8")
    br = BOOK_ROUTE.read_text(encoding="utf-8")

    print("== StepReview.tsx ==")
    check(
        "imports BookingPhoneVerification",
        "BookingPhoneVerification" in sr and "from \"./BookingPhoneVerification\"" in sr,
    )
    check(
        "renders <BookingPhoneVerification …/>",
        re.search(r"<BookingPhoneVerification\b", sr) is not None,
    )
    # phoneVerified must combine BOTH: a challenge id AND phone match.
    check(
        "phoneVerified requires verificationChallengeId",
        re.search(r"phoneVerified\s*=[\s\S]{0,120}state\.verificationChallengeId", sr) is not None,
    )
    check(
        "phoneVerified requires verifiedPhone === patient.phone",
        re.search(
            r"state\.verifiedPhone\s*===\s*state\.patient\.phone(?:\.trim\(\))?",
            sr,
        )
        is not None,
    )
    # Confirm button must include !phoneVerified in its disabled expression.
    check(
        "Confirm Button disabled uses !phoneVerified",
        re.search(r"disabled=\{[^}]*!phoneVerified[^}]*\}", sr) is not None,
        detail="expected: disabled={... || !phoneVerified}",
    )


    print("== book.tsx ==")
    check(
        "submits verification_challenge_id to API",
        re.search(
            r"verification_challenge_id\s*:\s*state\.verificationChallengeId",
            br,
        )
        is not None,
    )
    check(
        "wires onVerified → verificationChallengeId + verifiedPhone",
        "verificationChallengeId: challengeId" in br and "verifiedPhone: phone" in br,
    )

    print()
    if FAILED:
        print(f"❌ {len(FAILED)} فحص فشل:")
        for f in FAILED:
            print(f"   - {f}")
        sys.exit(1)
    print("✅ زر التأكيد يظل معطّلًا حتى اكتمال التحقق من OTP.")


if __name__ == "__main__":
    main()
