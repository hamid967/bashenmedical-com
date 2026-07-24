"""
E2E: End-to-end booking flow — hold → confirm → release.

Exercises the full public API path used by /book without opening a browser
(faster + more deterministic than driving the SPA):

  1. POST /api/public/book/hold           → slot_holds row created
                                            (released_at = NULL, expires_at ~5m)
  2. POST /api/public/book/hold  (refresh) → SAME slot_holds row (upsert on
                                            (doctor,date,time,session_id))
  3. Seed a *consumed* WhatsApp OTP challenge via service_role so the
     verification gate on /create passes (same normalization as
     normalizeSaudiMobile: 05XXXXXXXX → +9665XXXXXXXX, purpose='booking').
  4. POST /api/public/book/create         → appointment row created,
                                            reference = BMC-YYYYMMDD-XXXX
  5. DELETE /api/public/book/hold         → slot_holds.released_at is set
                                            (soft-release, per hold.ts)
  6. queue_entries — asserted only if Phase 3 table exists; otherwise
     the check is skipped with a clear log line.
  7. Cleanup: remove the appointment + slot_hold rows this test created.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional APP_BASE_URL
Run: python3 tests/e2e/book_full_flow_hold_release.py
"""
from __future__ import annotations

import json
import os
import re
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta, timezone, datetime

URL = os.environ["SUPABASE_URL"].rstrip("/")
SVC = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BASE = os.environ.get("APP_BASE_URL", "http://localhost:8080").rstrip("/")

BMC_RE = re.compile(r"^BMC-\d{8}-\d{4}$")

# ---------------------------------------------------------------------------
# thin HTTP helpers
# ---------------------------------------------------------------------------

def _do(url: str, *, method: str, headers: dict, body=None):
    req = urllib.request.Request(
        url,
        method=method,
        headers=headers,
        data=json.dumps(body).encode() if body is not None else None,
    )
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="ignore")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def sb(path: str, method: str = "GET", body=None, params: dict | None = None):
    """Direct PostgREST call with service_role (bypasses RLS)."""
    url = f"{URL}{path}"
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params, doseq=True)
    return _do(url, method=method, body=body, headers={
        "apikey": SVC,
        "Authorization": f"Bearer {SVC}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    })


def app(path: str, method: str = "POST", body=None, extra_headers=None):
    """Call the app's own public HTTP endpoints (localhost)."""
    return _do(f"{BASE}{path}", method=method, body=body, headers={
        "Content-Type": "application/json",
        **(extra_headers or {}),
    })


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------

def normalize_phone(raw: str) -> str:
    d = re.sub(r"[^\d+]", "", raw)
    if d.startswith("+966"): d = d[4:]
    elif d.startswith("966"): d = d[3:]
    elif d.startswith("0"): d = d[1:]
    assert re.match(r"^5\d{8}$", d), f"bad phone: {raw}"
    return f"+966{d}"


def pick_doctor():
    status, rows = sb(
        "/rest/v1/doctors",
        params={
            "select": "id,branch_id,specialty_id",
            "is_active": "eq.true",
            "booking_enabled": "eq.true",
            "limit": "1",
        },
    )
    assert status == 200 and rows, f"no active doctor: {status} {rows}"
    return rows[0]


def unique_slot():
    d = (date.today() + timedelta(days=30)).isoformat()
    # 09:MM with random minute — avoids clashes with real data + prior runs
    return d, f"09:{secrets.randbelow(60):02d}"


def seed_consumed_otp(destination_e164: str) -> str:
    """
    Insert an already-consumed booking OTP challenge so
    /api/public/book/create passes the verification gate.
    """
    now = datetime.now(timezone.utc)
    status, rows = sb("/rest/v1/otp_challenges", method="POST", body=[{
        "channel": "whatsapp",
        "destination": destination_e164,
        "purpose": "booking",
        "code_hash": "e2e-consumed-hash",
        "salt": "e2e-salt",
        "attempts": 1,
        "max_attempts": 5,
        "expires_at": (now + timedelta(minutes=10)).isoformat(),
        "consumed_at": now.isoformat(),
        "ua": "e2e-full-flow",
    }])
    assert status < 300 and rows, f"seed OTP failed: {status} {rows}"
    return rows[0]["id"]


# ---------------------------------------------------------------------------
# checks
# ---------------------------------------------------------------------------

def _fail(msg: str, extra=None) -> None:
    print(f"[FAIL] {msg}")
    if extra is not None:
        print(json.dumps(extra, indent=2, ensure_ascii=False, default=str))
    sys.exit(1)


def main():
    print(f"[cfg] BASE={BASE}  SUPABASE={URL}")
    doctor = pick_doctor()
    d, t = unique_slot()
    phone_raw = "0555000" + f"{secrets.randbelow(1000):03d}"
    phone_e164 = normalize_phone(phone_raw)
    session_id = "e2e-" + secrets.token_hex(8)
    idem_key = "e2e-" + secrets.token_hex(10)

    print(f"[cfg] doctor={doctor['id']}  slot={d} {t}  session={session_id}")

    # ----- Step 1: hold slot ------------------------------------------------
    st, body = app("/api/public/book/hold", "POST", {
        "doctor_id": doctor["id"],
        "branch_id": doctor.get("branch_id"),
        "appointment_date": d,
        "appointment_time": t,
        "session_id": session_id,
    })
    if st != 200 or not isinstance(body, dict) or not body.get("ok"):
        _fail("hold #1 did not return ok", {"status": st, "body": body})
    hold_id_1 = body["id"]
    print(f"[ok] hold created id={hold_id_1} expires_at={body.get('expires_at')}")

    # verify slot_holds row exists, active
    st, rows = sb("/rest/v1/slot_holds", params={
        "select": "id,released_at,expires_at,session_id",
        "id": f"eq.{hold_id_1}",
    })
    if st != 200 or not rows:
        _fail("slot_holds row not found after hold", {"status": st, "rows": rows})
    if rows[0]["released_at"] is not None:
        _fail("slot_holds released_at should be NULL initially", rows[0])
    print("[ok] slot_holds row is active (released_at IS NULL)")

    # ----- Step 2: refresh (idempotent for same session/slot) --------------
    st, body2 = app("/api/public/book/hold", "POST", {
        "doctor_id": doctor["id"],
        "branch_id": doctor.get("branch_id"),
        "appointment_date": d,
        "appointment_time": t,
        "session_id": session_id,
    })
    if st != 200 or not body2.get("ok"):
        _fail("hold refresh failed", {"status": st, "body": body2})
    if body2["id"] != hold_id_1:
        _fail("hold refresh returned a different id (upsert broken)",
              {"first": hold_id_1, "refresh": body2["id"]})
    print("[ok] hold refresh returned the SAME id (session-scoped upsert)")

    # ----- Step 3: seed consumed OTP so /create passes verification --------
    challenge_id = seed_consumed_otp(phone_e164)
    print(f"[ok] seeded consumed OTP challenge {challenge_id[:8]}… ({phone_e164})")

    # ----- Step 4: confirm booking -----------------------------------------
    st, book_body = app("/api/public/book/create", "POST", {
        "patient_name": "اختبار تدفق كامل",
        "patient_phone": phone_raw,
        "gender": "male",
        "doctor_id": doctor["id"],
        "branch_id": doctor.get("branch_id"),
        "specialty_id": doctor.get("specialty_id"),
        "appointment_date": d,
        "appointment_time": t,
        "reason": "e2e full-flow test",
        "verification_challenge_id": challenge_id,
    }, extra_headers={"Idempotency-Key": idem_key})
    if st != 200 or not isinstance(book_body, dict) or not book_body.get("ok"):
        _fail("create booking did not return ok", {"status": st, "body": book_body})
    ref = book_body.get("reference")
    if not ref or not BMC_RE.match(ref):
        _fail("reference not in BMC format", {"reference": ref})
    print(f"[ok] booking confirmed reference={ref}")

    # locate the appointment row
    st, appts = sb("/rest/v1/appointments", params={
        "select": "id,status,reference_number,idempotency_key,appointment_date,appointment_time,doctor_id",
        "idempotency_key": f"eq.{idem_key}",
    })
    if st != 200 or len(appts) != 1:
        _fail("expected exactly 1 appointment for idem key", {"status": st, "rows": appts})
    appt = appts[0]
    if appt["reference_number"] != ref:
        _fail("appointment reference mismatch", {"appt": appt, "ref": ref})
    if appt["status"] not in ("new", "confirmed"):
        _fail(f"unexpected initial status: {appt['status']}", appt)
    print(f"[ok] appointment persisted id={appt['id']} status={appt['status']}")

    # ----- Step 5: release hold --------------------------------------------
    st, rel = app("/api/public/book/hold", "DELETE", {
        "session_id": session_id,
        "id": hold_id_1,
    })
    if st != 200 or not isinstance(rel, dict) or rel.get("ok") is not True:
        _fail("release hold did not ack ok", {"status": st, "body": rel})
    print(f"[ok] release DELETE ok → released={rel.get('released')}")

    st, rows = sb("/rest/v1/slot_holds", params={
        "select": "id,released_at",
        "id": f"eq.{hold_id_1}",
    })
    if st != 200 or not rows:
        _fail("slot_holds row disappeared unexpectedly", {"status": st, "rows": rows})
    if rows[0]["released_at"] is None:
        _fail("slot_holds.released_at still NULL after DELETE", rows[0])
    print(f"[ok] slot_holds.released_at set → {rows[0]['released_at']}")

    # ----- Step 6: queue_entries (Phase 3) — MUST auto-create --------------
    st_q, q_rows = sb("/rest/v1/queue_entries", params={
        "select": "id,appointment_id,doctor_id,branch_id,queue_date,queue_number,status",
        "appointment_id": f"eq.{appt['id']}",
    })
    if st_q != 200:
        _fail("queue_entries lookup failed", {"status": st_q, "rows": q_rows})
    if len(q_rows) != 1:
        _fail("expected exactly 1 queue_entry auto-created for appointment",
              {"rows": q_rows})
    qe = q_rows[0]
    if qe["status"] != "waiting":
        _fail(f"queue_entry initial status must be 'waiting', got {qe['status']}", qe)
    if not isinstance(qe["queue_number"], int) or qe["queue_number"] < 1:
        _fail("queue_number must be a positive integer", qe)
    if qe["doctor_id"] != appt["doctor_id"]:
        _fail("queue_entry doctor_id mismatch", {"qe": qe, "appt": appt})
    if str(qe["queue_date"]) != str(appt["appointment_date"]):
        _fail("queue_entry date mismatch", {"qe": qe, "appt": appt})
    print(f"[ok] queue_entries auto-created "
          f"#{qe['queue_number']} status={qe['status']}")

    # Cancel the appointment → queue_entry should transition to 'cancelled'.
    st_up, _ = sb(f"/rest/v1/appointments",
                  method="PATCH",
                  params={"id": f"eq.{appt['id']}"},
                  body={"status": "cancelled"})
    if st_up not in (200, 204):
        print(f"[warn] appointment status update returned {st_up}; "
              "skipping queue sync assertion")
    else:
        _, q2 = sb("/rest/v1/queue_entries", params={
            "select": "status",
            "appointment_id": f"eq.{appt['id']}",
        })
        if q2 and q2[0]["status"] == "cancelled":
            print("[ok] queue_entry synced to 'cancelled' after appointment cancel")
        else:
            _fail("queue_entry did not sync to 'cancelled'", q2)

    # ----- Cleanup ---------------------------------------------------------
    sb("/rest/v1/appointments", method="DELETE",
       params={"id": f"eq.{appt['id']}"})
    sb("/rest/v1/slot_holds", method="DELETE",
       params={"id": f"eq.{hold_id_1}"})
    sb("/rest/v1/otp_challenges", method="DELETE",
       params={"id": f"eq.{challenge_id}"})
    print("[ok] cleanup done")

    print("\nAll checks passed ✓")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"[FAIL] assertion: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"[FAIL] unexpected: {e!r}")
        sys.exit(1)
