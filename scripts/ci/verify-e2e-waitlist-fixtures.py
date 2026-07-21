"""
CI preflight — قبل اختبار waitlist offer confirm E2E.

يتحقق من:
  - fixtures الحجز (branch + doctor + doctor_branches).
  - slot_holds RW round-trip (SERVICE_ROLE).
  - appointment_waitlist RW بحالة 'notified' مربوطة بـ hold صالح.
  - soft: وجود availability_slot لتاريخ/وقت العرض (+10d, 09:00:00).

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  E2E_BRANCH_SLUG (default e2e-branch)
  E2E_DOCTOR_SLUG (default e2e-doctor)
  E2E_VERIFY_REPORT (default verify-artifacts/waitlist-fixtures.json)

يكتب دائمًا تقرير JSON منظّم إلى E2E_VERIFY_REPORT (حتى عند الفشل) يتضمّن:
  { status, tag, timestamp, env: {...}, checks: [...], fixtures: {...},
    values: {...}, failure: { step, reason, http?: {status, body} } }
"""
from __future__ import annotations

import json
import os
import sys
import time
import traceback
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _verify_common import SupaClient, get_e2e_bundle  # noqa: E402

TAG = "verify-waitlist"
HINT = ("راجع scripts/ci/ensure-e2e-booking-fixtures.py و RLS "
        "لجدولَي slot_holds و appointment_waitlist.")

BRANCH_SLUG = os.environ.get("E2E_BRANCH_SLUG", "e2e-branch")
DOC_SLUG = os.environ.get("E2E_DOCTOR_SLUG", "e2e-doctor")
REPORT_PATH = Path(os.environ.get(
    "E2E_VERIFY_REPORT", "verify-artifacts/waitlist-fixtures.json"
))

OFFER_DATE = (date.today() + timedelta(days=10)).isoformat()
OFFER_TIME = "09:00:00"


# ------------------------------- report ------------------------------------

class Report:
    def __init__(self) -> None:
        self.data: dict = {
            "status": "unknown",
            "tag": TAG,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "env": {
                "BRANCH_SLUG": BRANCH_SLUG,
                "DOCTOR_SLUG": DOC_SLUG,
                "SUPABASE_URL": os.environ.get("SUPABASE_URL", ""),
            },
            "values": {
                "offer_date": OFFER_DATE,
                "offer_time": OFFER_TIME,
            },
            "fixtures": {},
            "checks": [],
            "failure": None,
        }
        self._step: str | None = None

    def step(self, name: str) -> None:
        self._step = name

    def add_check(self, name: str, ok: bool, **details) -> None:
        entry = {"name": name, "ok": ok}
        if details:
            entry["details"] = details
        self.data["checks"].append(entry)

    def set_fixtures(self, **fixtures) -> None:
        self.data["fixtures"].update(fixtures)

    def set_value(self, **values) -> None:
        self.data["values"].update(values)

    def fail(self, reason: str, http: tuple[int, str] | None = None) -> None:
        entry: dict = {"step": self._step, "reason": reason}
        if http:
            entry["http"] = {"status": http[0], "body": http[1][:400]}
        self.data["failure"] = entry
        self.data["status"] = "fail"

    def finalize_ok(self) -> None:
        if self.data["status"] != "fail":
            self.data["status"] = "ok"

    def write(self) -> None:
        REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        REPORT_PATH.write_text(
            json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"[{TAG}] report → {REPORT_PATH}")


# ------------------------------- client wrapper ----------------------------

class ReportingClient(SupaClient):
    """SupaClient that mirrors failures into a Report before exiting."""
    report: Report = None  # type: ignore[assignment]

    def fail(self, msg: str) -> None:  # type: ignore[override]
        if self.report is not None:
            # Try to enrich with last HTTP context if the message begins with HTTP
            self.report.fail(msg)
            try:
                self.report.write()
            except Exception:
                pass
        super().fail(msg)


# ------------------------------- main --------------------------------------

def _run(cli: ReportingClient, rep: Report) -> None:
    rep.step("fixtures")
    branch, spec, doctor = get_e2e_bundle(
        cli, branch_slug=BRANCH_SLUG, doctor_slug=DOC_SLUG
    )
    rep.set_fixtures(
        branch={"id": branch["id"], "slug": branch.get("slug"),
                "name_ar": branch.get("name_ar")},
        specialty={"id": spec["id"], "slug": spec.get("slug")},
        doctor={"id": doctor["id"], "slug": doctor.get("slug"),
                "name_ar": doctor.get("name_ar")},
    )
    rep.add_check("fixtures.branch", True, slug=BRANCH_SLUG)
    rep.add_check("fixtures.doctor", True, slug=DOC_SLUG)
    rep.add_check("fixtures.doctor_branches", True)

    # 1) slot_holds RW round-trip
    rep.step("slot_holds.insert")
    expires = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    hold = cli.first(
        cli.post("/rest/v1/slot_holds", {
            "doctor_id": doctor["id"],
            "branch_id": branch["id"],
            "appointment_date": OFFER_DATE,
            "appointment_time": OFFER_TIME,
            "session_id": f"wl-preflight:{int(time.time())}",
            "expires_at": expires,
        }),
        "insert slot_hold (preflight)",
    )
    hold_id = hold["id"]
    rep.set_value(slot_hold_id=hold_id, slot_hold_expires_at=expires)
    rep.add_check("slot_holds.insert", True, id=hold_id)

    # 2) appointment_waitlist notified
    rep.step("appointment_waitlist.insert")
    wl_res = cli.post("/rest/v1/appointment_waitlist", {
        "reference": "PENDING",
        "patient_name": f"E2E_WL_PREFLIGHT_{int(time.time())}",
        "patient_phone": f"055500{int(time.time()) % 10000:04d}",
        "doctor_id": doctor["id"],
        "branch_id": branch["id"],
        "specialty_id": doctor.get("specialty_id"),
        "preferred_from": OFFER_DATE,
        "preferred_to": OFFER_DATE,
        "status": "notified",
        "notified_at": datetime.now(timezone.utc).isoformat(),
        "offered_date": OFFER_DATE,
        "offered_time": OFFER_TIME,
        "offered_hold_id": hold_id,
        "offered_expires_at": expires,
    })
    if wl_res[0] >= 300:
        cli.delete(f"/rest/v1/slot_holds?id=eq.{hold_id}")
        rep.fail(f"insert appointment_waitlist failed", http=wl_res)
        cli.fail(f"insert appointment_waitlist: HTTP {wl_res[0]} — {wl_res[1][:300]}")
    wl_id = json.loads(wl_res[1])[0]["id"]
    rep.set_value(waitlist_id=wl_id)
    rep.add_check("appointment_waitlist.insert", True, id=wl_id)

    # 3) read-back
    rep.step("appointment_waitlist.read_back")
    row = cli.rows(
        cli.get("/rest/v1/appointment_waitlist", {
            "id": f"eq.{wl_id}",
            "select": "id,status,offered_hold_id,offered_expires_at",
        }),
        "read-back waitlist",
    )
    ok = bool(row and row[0].get("status") == "notified"
              and row[0].get("offered_hold_id") == hold_id)
    # cleanup regardless
    cli.delete(f"/rest/v1/appointment_waitlist?id=eq.{wl_id}")
    cli.delete(f"/rest/v1/slot_holds?id=eq.{hold_id}")
    rep.add_check("appointment_waitlist.read_back", ok,
                  status=(row[0].get("status") if row else None),
                  offered_hold_id=(row[0].get("offered_hold_id") if row else None))
    if not ok:
        rep.fail(f"read-back waitlist mismatch: {row!r}")
        cli.fail(f"read-back waitlist غير مطابق: {row!r}")

    # 4) soft check — availability_slot
    rep.step("availability_slots.soft")
    slots = cli.rows(
        cli.get("/rest/v1/availability_slots", {
            "doctor_id": f"eq.{doctor['id']}",
            "slot_date": f"eq.{OFFER_DATE}",
            "start_time": f"eq.{OFFER_TIME}",
            "select": "id,status",
            "limit": "1",
        }),
        "availability_slots (soft)",
    )
    slot_note = ("موجود" if slots else "غير موجود")
    rep.add_check("availability_slots.soft", True,
                  found=bool(slots),
                  status=(slots[0].get("status") if slots else None),
                  note="اختبار soft — لا يُفشل عند الغياب")

    cli.ok(
        f"branch={branch['name_ar']!r} doctor={doctor['name_ar']!r} "
        f"slot_holds RW ✓ appointment_waitlist RW ✓ "
        f"slot@{OFFER_DATE} {OFFER_TIME}: {slot_note}"
    )


def main() -> None:
    cli, _ = ReportingClient.from_env(TAG, fail_hint=HINT)
    rep = Report()
    cli.report = rep  # type: ignore[attr-defined]

    exit_code = 0
    try:
        _run(cli, rep)
        rep.finalize_ok()
    except SystemExit as e:
        exit_code = int(e.code) if isinstance(e.code, int) else 1
    except Exception as e:  # noqa: BLE001
        rep.fail(f"exception: {e!r}\n{traceback.format_exc()[-400:]}")
        exit_code = 1

    try:
        rep.write()
    except Exception as e:  # noqa: BLE001
        print(f"[{TAG}][warn] فشل كتابة التقرير: {e}", file=sys.stderr)

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
