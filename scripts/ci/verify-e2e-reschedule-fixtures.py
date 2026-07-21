"""
CI preflight — قبل اختبار E2E لإعادة الجدولة (portal_reschedule_appointment).

يتحقق من:
  1) fixtures الحجز (branch/specialty/doctor + doctor_branches).
  2) توجد slot متاحة للطبيب E2E في نافذة إعادة الجدولة (افتراضياً +30..+60 يوم)
     وعلى الأقل واحدة عند وقت الهدف (افتراضياً 14:30).
  3) مستخدم E2E admin موجود في auth.users.

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, E2E_ADMIN_EMAIL

Optional:
  E2E_BRANCH_SLUG (e2e-branch), E2E_SPECIALTY_SLUG (e2e-specialty),
  E2E_DOCTOR_SLUG (e2e-doctor), E2E_RESCHED_DAYS_MIN (30),
  E2E_RESCHED_DAYS_MAX (60), E2E_RESCHED_TARGET_TIME ('14:30')
"""
from __future__ import annotations

import os
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _verify_common import (  # noqa: E402
    SupaClient, find_admin_user_id, get_e2e_bundle, run,
)

TAG = "verify-resched"
HINT = ("تلميح: شغّل scripts/ci/ensure-e2e-booking-fixtures.py و "
        "scripts/ci/ensure-e2e-admin.py ثم أعد المحاولة.")

BRANCH_SLUG = os.environ.get("E2E_BRANCH_SLUG", "e2e-branch")
SPEC_SLUG = os.environ.get("E2E_SPECIALTY_SLUG", "e2e-specialty")
DOC_SLUG = os.environ.get("E2E_DOCTOR_SLUG", "e2e-doctor")
DAYS_MIN = int(os.environ.get("E2E_RESCHED_DAYS_MIN", "30"))
DAYS_MAX = int(os.environ.get("E2E_RESCHED_DAYS_MAX", "60"))
TARGET_TIME = os.environ.get("E2E_RESCHED_TARGET_TIME", "14:30").strip()[:5]

cli, env = SupaClient.from_env(TAG, extra_required=["E2E_ADMIN_EMAIL"], fail_hint=HINT)

if not (0 <= DAYS_MIN < DAYS_MAX):
    cli.fail(f"نافذة زمنية غير صالحة: {DAYS_MIN}..{DAYS_MAX}")


def main() -> None:
    _branch, _spec, doctor = get_e2e_bundle(
        cli, branch_slug=BRANCH_SLUG, spec_slug=SPEC_SLUG, doctor_slug=DOC_SLUG
    )

    lo = (date.today() + timedelta(days=DAYS_MIN)).isoformat()
    hi = (date.today() + timedelta(days=DAYS_MAX)).isoformat()
    slots = cli.rows(
        cli.get("/rest/v1/availability_slots", {
            "select": "slot_date,start_time,status",
            "doctor_id": f"eq.{doctor['id']}",
            "status": "eq.available",
            "and": f"(slot_date.gte.{lo},slot_date.lte.{hi})",
            "limit": "500",
        }),
        "availability_slots (reschedule window)",
    )
    if not slots:
        cli.fail(f"لا توجد slot متاحة للطبيب E2E في النافذة ({lo}..{hi}).")

    matches = [s for s in slots if str(s.get("start_time", ""))[:5] == TARGET_TIME]
    if not matches:
        sample = sorted({str(s["start_time"])[:5] for s in slots})[:10]
        cli.fail(
            f"لا توجد slot متاحة عند الوقت الهدف {TARGET_TIME} في النافذة "
            f"({lo}..{hi}). أمثلة الأوقات المتاحة: {sample}"
        )

    find_admin_user_id(cli, env["E2E_ADMIN_EMAIL"])

    cli.ok(
        f"doctor={doctor['name_ar']!r} window={lo}..{hi} slots={len(slots)} "
        f"target={TARGET_TIME} matches={len(matches)} admin_ok=1"
    )


if __name__ == "__main__":
    run(main, cli)
