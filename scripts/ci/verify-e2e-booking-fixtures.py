"""
CI preflight: يتحقق أن fixtures الحجز E2E موجودة وأن availability_slots
تحتوي على أوقات صالحة قبل تشغيل مجموعة اختبارات الحجز.

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

Optional:
  E2E_MIN_AVAILABLE_SLOTS  (default 3)
  E2E_BRANCH_SLUG          (default 'e2e-branch')
  E2E_SPECIALTY_SLUG       (default 'e2e-specialty')
  E2E_DOCTOR_SLUG          (default 'e2e-doctor')

Exit: 0 pass, 1 fail.
"""
from __future__ import annotations

import os
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _verify_common import SupaClient, get_e2e_bundle, run  # noqa: E402

TAG = "verify-booking"
HINT = "شغّل: python scripts/ci/ensure-e2e-booking-fixtures.py ثم أعد المحاولة."

BRANCH_SLUG = os.environ.get("E2E_BRANCH_SLUG", "e2e-branch")
SPEC_SLUG = os.environ.get("E2E_SPECIALTY_SLUG", "e2e-specialty")
DOC_SLUG = os.environ.get("E2E_DOCTOR_SLUG", "e2e-doctor")
MIN_SLOTS = int(os.environ.get("E2E_MIN_AVAILABLE_SLOTS", "3"))

cli, _ = SupaClient.from_env(TAG, fail_hint=HINT)


def main() -> None:
    branch, spec, doctor = get_e2e_bundle(
        cli, branch_slug=BRANCH_SLUG, spec_slug=SPEC_SLUG, doctor_slug=DOC_SLUG
    )

    today = date.today().isoformat()
    horizon = (date.today() + timedelta(days=14)).isoformat()
    slots = cli.rows(
        cli.get("/rest/v1/availability_slots", {
            "select": "slot_date,start_time,status",
            "doctor_id": f"eq.{doctor['id']}",
            "status": "eq.available",
            "and": f"(slot_date.gte.{today},slot_date.lte.{horizon})",
            "limit": "500",
        }),
        "availability_slots (14d window)",
    )
    if len(slots) < MIN_SLOTS:
        cli.fail(
            f"عدد الـ slots المتاحة ({len(slots)}) أقل من الحد الأدنى "
            f"({MIN_SLOTS}) للطبيب E2E خلال 14 يوم."
        )

    unique_days = {s["slot_date"] for s in slots}
    cli.ok(
        f"branch={branch['name_ar']!r} specialty={spec['slug']!r} "
        f"doctor={doctor['name_ar']!r} available_slots={len(slots)} "
        f"days={len(unique_days)}"
    )


if __name__ == "__main__":
    run(main, cli)
