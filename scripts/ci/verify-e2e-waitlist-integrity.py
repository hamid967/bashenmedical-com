"""
CI preflight — waitlist ↔ slot_holds integrity scan.

يمسح كل صفوف `appointment_waitlist` بحالة `notified` ويتحقق أن
`offered_hold_id` يشير إلى صف موجود في `slot_holds` بنفس
`doctor_id` و `branch_id`. أي عدم تطابق (mismatch) يُفشل الـpreflight
قبل بدء اختبارات waitlist.

الحالات "الليّنة" (بدون offered_hold_id، أو hold محذوف/مُحرَّر) تُطبع
كتحذير ولا تُفشل الـpreflight — تجنّبًا لحظر CI بسبب حالة تاريخية.

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  E2E_VERIFY_REPORT (default verify-artifacts/waitlist-integrity.json)
  E2E_WAITLIST_INTEGRITY_LIMIT (default 500)

يكتب تقرير JSON دائمًا (نجاح أو فشل).
"""
from __future__ import annotations

import json
import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _verify_common import SupaClient  # noqa: E402

TAG = "verify-waitlist-integrity"
HINT = ("راجع صفوف appointment_waitlist بحالة 'notified' وصحّح "
        "offered_hold_id ليتطابق مع slot_holds في doctor_id/branch_id.")

REPORT_PATH = Path(os.environ.get(
    "E2E_VERIFY_REPORT", "verify-artifacts/waitlist-integrity.json"
))
LIMIT = int(os.environ.get("E2E_WAITLIST_INTEGRITY_LIMIT", "500"))


def _write_report(data: dict) -> None:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"[{TAG}] report → {REPORT_PATH}")


def _run(cli: SupaClient) -> dict:
    report: dict = {
        "status": "unknown",
        "tag": TAG,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "env": {"SUPABASE_URL": os.environ.get("SUPABASE_URL", "")},
        "limit": LIMIT,
        "scanned": 0,
        "mismatches": [],
        "orphans": [],
        "failure": None,
    }

    rows = cli.rows(
        cli.get("/rest/v1/appointment_waitlist", {
            "status": "eq.notified",
            "select": "id,doctor_id,branch_id,offered_hold_id",
            "limit": str(LIMIT),
        }),
        "scan notified waitlist rows",
    )
    report["scanned"] = len(rows)

    mismatches: list[dict] = []
    orphans: list[dict] = []

    for r in rows:
        hid = r.get("offered_hold_id")
        if not hid:
            orphans.append({"waitlist_id": r["id"], "reason": "missing offered_hold_id"})
            continue
        hrow = cli.rows(
            cli.get("/rest/v1/slot_holds", {
                "id": f"eq.{hid}",
                "select": "id,doctor_id,branch_id,released_at",
            }),
            "lookup linked hold",
        )
        if not hrow:
            orphans.append({"waitlist_id": r["id"], "hold_id": hid,
                            "reason": "hold missing"})
            continue
        h = hrow[0]
        if h.get("released_at") is not None:
            orphans.append({"waitlist_id": r["id"], "hold_id": hid,
                            "reason": "hold released"})
        if h["doctor_id"] != r["doctor_id"]:
            mismatches.append({
                "waitlist_id": r["id"], "hold_id": hid,
                "field": "doctor_id",
                "waitlist": r["doctor_id"], "hold": h["doctor_id"],
            })
        if h.get("branch_id") != r.get("branch_id"):
            mismatches.append({
                "waitlist_id": r["id"], "hold_id": hid,
                "field": "branch_id",
                "waitlist": r.get("branch_id"), "hold": h.get("branch_id"),
            })

    report["mismatches"] = mismatches
    report["orphans"] = orphans

    if orphans:
        print(f"[{TAG}] WARN: {len(orphans)} orphan notified row(s)")
        for o in orphans:
            print(f"  - {o}")

    if mismatches:
        report["status"] = "fail"
        report["failure"] = {
            "reason": f"waitlist↔slot_holds doctor/branch mismatch ({len(mismatches)} صف)",
            "mismatches": mismatches,
        }
        return report

    report["status"] = "ok"
    return report


def main() -> None:
    cli, _ = SupaClient.from_env(TAG, fail_hint=HINT)
    exit_code = 0
    report: dict
    try:
        report = _run(cli)
        if report["status"] == "fail":
            _write_report(report)
            cli.fail(
                "توجد صفوف waitlist بحالة 'notified' لا تتطابق مع slot_holds "
                "في doctor_id/branch_id:\n  - "
                + "\n  - ".join(
                    f"wl={m['waitlist_id']} hold={m['hold_id']} "
                    f"{m['field']}: wl={m['waitlist']} hold={m['hold']}"
                    for m in report["failure"]["mismatches"]
                )
            )
        else:
            cli.ok(f"scanned={report['scanned']} mismatches=0 "
                   f"orphans={len(report['orphans'])}")
    except SystemExit as e:
        exit_code = int(e.code) if isinstance(e.code, int) else 1
    except Exception as e:  # noqa: BLE001
        report = {
            "status": "fail", "tag": TAG,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "failure": {"reason": f"exception: {e!r}",
                        "trace": traceback.format_exc()[-400:]},
        }
        exit_code = 1

    try:
        _write_report(report)  # type: ignore[arg-type]
    except Exception as e:  # noqa: BLE001
        print(f"[{TAG}][warn] فشل كتابة التقرير: {e}", file=sys.stderr)

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
