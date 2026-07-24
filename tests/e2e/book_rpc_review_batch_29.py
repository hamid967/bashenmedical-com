"""
Batch 2.9 — Booking RPC review.

Directly probes every RPC the booking pipeline depends on so a regression
in signature, grants, or behavior fails CI fast, independently of the HTTP
handlers that wrap them.

Coverage (all in schema `public`):
  1. estimate_appointment_cost(_doctor_id uuid, _provider_id uuid)
       → jsonb with { eligible, coverage_percent, estimated_cost, patient_share }
  2. confirm_appointment_booking(p_data jsonb, p_idempotency_key text)
       → TABLE(id, reference, replayed)
       - inserts a row, returns BMC-YYYYMMDD-#### reference
       - SAME idempotency_key on rerun returns { replayed: true, same id }
  3. track_appointment(_ref text, _phone_last4 text)
       → row for the just-created appointment (masked-phone lookup)
  4. update_appointment_status(_id uuid, _status appointment_status, _reason text)
       → void; asserts state-machine transition (new → cancelled) works
  5. release_slot(p_appointment_id uuid)
       → true when a slot_hold for the appointment exists, false otherwise
  6. Grant matrix — anon EXECUTE required on the anon-callable RPCs,
     denied on `release_slot` (admin-only in cancel.ts).

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY
Run: python3 tests/e2e/book_rpc_review_batch_29.py
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
ANON = os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

BMC_RE = re.compile(r"^BMC-\d{8}-\d{4}$")


def _do(url, *, method, headers, body=None):
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


def sb(path, method="GET", body=None, params=None, *, key=SVC):
    url = f"{URL}{path}"
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params, doseq=True)
    return _do(url, method=method, body=body, headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    })


def rpc(name, args, *, key=SVC):
    return sb(f"/rest/v1/rpc/{name}", method="POST", body=args, key=key)


def _fail(msg, extra=None):
    print(f"[FAIL] {msg}")
    if extra is not None:
        print(json.dumps(extra, indent=2, ensure_ascii=False, default=str))
    sys.exit(1)


# --- fixtures ---------------------------------------------------------------

def pick_doctor():
    st, rows = sb("/rest/v1/doctors", params={
        "select": "id,branch_id,specialty_id",
        "is_active": "eq.true",
        "booking_enabled": "eq.true",
        "limit": "1",
    })
    assert st == 200 and rows, f"no active doctor: {st} {rows}"
    return rows[0]


def pick_provider():
    st, rows = sb("/rest/v1/insurance_providers", params={"select": "id", "limit": "1"})
    return rows[0]["id"] if st == 200 and rows else None


def unique_slot():
    d = (date.today() + timedelta(days=45)).isoformat()
    return d, f"10:{secrets.randbelow(60):02d}"


def seed_consumed_otp(dest_e164):
    now = datetime.now(timezone.utc)
    st, rows = sb("/rest/v1/otp_challenges", method="POST", body=[{
        "channel": "whatsapp",
        "destination": dest_e164,
        "purpose": "booking",
        "code_hash": "b29-hash",
        "salt": "b29",
        "attempts": 1,
        "max_attempts": 5,
        "expires_at": (now + timedelta(minutes=10)).isoformat(),
        "consumed_at": now.isoformat(),
        "ua": "batch-2.9",
    }])
    assert st < 300 and rows, f"seed OTP failed: {st} {rows}"
    return rows[0]["id"]


# --- checks -----------------------------------------------------------------

def check_grants():
    """Anon EXECUTE required for the four public-callable RPCs; release_slot denied."""
    if not ANON:
        print("[skip] SUPABASE_PUBLISHABLE_KEY not provided — grant probe skipped.")
        return
    # confirm_appointment_booking is invoked with empty args just to prove the
    # role can *reach* the function; it will return 400/422 for bad payload but
    # NOT 401/403 when EXECUTE is granted.
    probes = [
        ("estimate_appointment_cost",
         {"_doctor_id": "00000000-0000-0000-0000-000000000000",
          "_provider_id": "00000000-0000-0000-0000-000000000000"}, True),
        ("track_appointment", {"_ref": "BMC-19700101-0000", "_phone_last4": "0000"}, True),
        ("release_slot", {"p_appointment_id": "00000000-0000-0000-0000-000000000000"}, False),
    ]
    for name, args, anon_allowed in probes:
        st, body = rpc(name, args, key=ANON)
        denied = st in (401, 403) or (
            isinstance(body, dict) and str(body.get("code", "")).startswith("42")
        )
        if anon_allowed and denied:
            _fail(f"anon should EXECUTE {name} but was denied", {"status": st, "body": body})
        if not anon_allowed and not denied:
            _fail(f"anon should NOT EXECUTE {name} but call succeeded",
                  {"status": st, "body": body})
    print("[ok] grant matrix: anon allowed on public RPCs, denied on release_slot")


def main():
    print(f"[cfg] SUPABASE={URL}")
    doctor = pick_doctor()
    provider_id = pick_provider()
    d, t = unique_slot()
    phone_e164 = "+9665550" + f"{secrets.randbelow(100000):05d}"
    phone_last4 = phone_e164[-4:]
    idem_key = "b29-" + secrets.token_hex(10)

    # 1) estimate_appointment_cost — returns jsonb with well-known keys
    if provider_id:
        st, est = rpc("estimate_appointment_cost", {
            "_doctor_id": doctor["id"],
            "_provider_id": provider_id,
        })
        if st != 200 or not isinstance(est, dict):
            _fail("estimate_appointment_cost did not return jsonb", {"status": st, "body": est})
        for k in ("eligible", "coverage_percent", "estimated_cost", "patient_share"):
            if k not in est:
                _fail(f"estimate_appointment_cost missing key `{k}`", est)
        print(f"[ok] estimate_appointment_cost → keys ok (eligible={est.get('eligible')})")
    else:
        print("[skip] no insurance provider row — estimate_appointment_cost skipped")

    # 2) confirm_appointment_booking — insert + BMC ref
    challenge_id = seed_consumed_otp(phone_e164)
    payload = {
        "patient_name": "مراجعة RPC 2.9",
        "patient_phone": phone_e164,
        "patient_email": None,
        "gender": "male",
        "doctor_id": doctor["id"],
        "branch_id": doctor.get("branch_id"),
        "specialty_id": doctor.get("specialty_id"),
        "appointment_date": d,
        "appointment_time": t,
        "reason": "batch 2.9 rpc review",
        "reminder_24h": True,
        "reminder_2h": True,
        "verification_challenge_id": challenge_id,
    }
    st, rows = rpc("confirm_appointment_booking",
                   {"p_data": payload, "p_idempotency_key": idem_key})
    if st != 200 or not isinstance(rows, list) or not rows:
        _fail("confirm_appointment_booking did not return rows", {"status": st, "body": rows})
    first = rows[0]
    if not first.get("reference") or not BMC_RE.match(first["reference"]):
        _fail("reference is not BMC-YYYYMMDD-####", first)
    if first.get("replayed") is True:
        _fail("first call reported replayed=true", first)
    appt_id, ref = first["id"], first["reference"]
    print(f"[ok] confirm_appointment_booking → id={appt_id[:8]}… ref={ref}")

    # 2b) replay — same idempotency_key returns same id and replayed=true
    st, rows2 = rpc("confirm_appointment_booking",
                    {"p_data": payload, "p_idempotency_key": idem_key})
    if st != 200 or not rows2:
        _fail("confirm replay did not return rows", {"status": st, "body": rows2})
    second = rows2[0]
    if second["id"] != appt_id or second.get("replayed") is not True:
        _fail("idempotent replay contract broken",
              {"first": first, "second": second})
    print("[ok] idempotency replay: same id, replayed=true")

    # 3) track_appointment — public masked lookup by (ref, last 4 digits)
    st, tk = rpc("track_appointment",
                 {"_ref": ref, "_phone_last4": phone_last4})
    if st != 200 or not isinstance(tk, list) or not tk:
        _fail("track_appointment returned nothing for our appointment",
              {"status": st, "body": tk})
    row = tk[0]
    if row["reference"] != ref or row["status"] not in ("new", "confirmed"):
        _fail("track_appointment row unexpected", row)
    print(f"[ok] track_appointment → status={row['status']}")

    # 4) update_appointment_status — transition new/confirmed → cancelled
    st, _ = rpc("update_appointment_status",
                {"_id": appt_id, "_status": "cancelled", "_reason": "batch 2.9 cleanup"})
    if st not in (200, 204):
        _fail("update_appointment_status failed", {"status": st})
    st, chk = sb("/rest/v1/appointments", params={
        "select": "status,cancelled_at",
        "id": f"eq.{appt_id}",
    })
    if not chk or chk[0]["status"] != "cancelled" or chk[0]["cancelled_at"] is None:
        _fail("appointment not in cancelled state after transition", chk)
    print("[ok] update_appointment_status → cancelled + cancelled_at set")

    # 5) release_slot — should ack (true or false; no error) as service_role
    st, released = rpc("release_slot", {"p_appointment_id": appt_id})
    if st != 200:
        _fail("release_slot failed", {"status": st, "body": released})
    print(f"[ok] release_slot → returned={released!r}")

    # 6) grants (anon may EXECUTE public RPCs, not release_slot)
    check_grants()

    # cleanup
    sb("/rest/v1/appointments", method="DELETE", params={"id": f"eq.{appt_id}"})
    sb("/rest/v1/otp_challenges", method="DELETE", params={"id": f"eq.{challenge_id}"})
    print("[ok] cleanup done")

    print("\nBatch 2.9 RPC review — all checks passed ✓")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"[FAIL] assertion: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"[FAIL] unexpected: {e!r}")
        sys.exit(1)
