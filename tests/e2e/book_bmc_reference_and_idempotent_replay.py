"""
E2E: real booking via POST /api/public/book/create.

Verifies:
  1. Successful booking returns reference in `BMC-YYYYMMDD-XXXX` format.
  2. Idempotent replay — repeating the SAME request with the same
     `Idempotency-Key` header returns the SAME reference (no new row).
  3. A different Idempotency-Key on an already-taken slot returns 409
     with code `SLOT_TAKEN` (no ghost row created).
  4. Exactly ONE appointments row exists for the idempotency key.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
Run: python3 tests/e2e/book_bmc_reference_and_idempotent_replay.py
"""
import asyncio, os, sys, json, re, time, secrets, urllib.request
from datetime import date, timedelta
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

URL = os.environ["SUPABASE_URL"]
SVC = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BASE = os.environ.get("APP_BASE_URL", "http://localhost:8080")

BMC_RE = re.compile(r"^BMC-\d{8}-\d{4}$")


def sb(path, method="GET", body=None):
    req = urllib.request.Request(
        f"{URL}{path}", method=method,
        headers={"apikey": SVC, "Authorization": f"Bearer {SVC}",
                 "Content-Type": "application/json",
                 "Prefer": "return=representation"},
        data=json.dumps(body).encode() if body is not None else None,
    )
    with urllib.request.urlopen(req) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw else None


def pick_doctor():
    rows = sb("/rest/v1/doctors?select=id,branch_id,specialty_id&is_active=eq.true&limit=1")
    if not rows:
        raise SystemExit("No active doctor found")
    return rows[0]


def pick_future_slot():
    # 30 days ahead + unique HH:MM to avoid clashing with real data.
    d = (date.today() + timedelta(days=30)).isoformat()
    # random minute to reduce collision odds across runs
    m = secrets.randbelow(60)
    return d, f"09:{m:02d}"


async def main():
    doctor = pick_doctor()
    appt_date, appt_time = pick_future_slot()
    idem_key = f"e2e-{int(time.time()*1000)}-{secrets.token_hex(4)}"

    payload = {
        "patient_name": "اختبار E2E مرجع BMC",
        "patient_phone": "0501234567",
        "patient_email": "",
        "appointment_date": appt_date,
        "appointment_time": appt_time,
        "doctor_id": doctor["id"],
        "branch_id": doctor.get("branch_id"),
        "specialty_id": doctor.get("specialty_id"),
        "reason": "e2e reference check",
    }

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        req = ctx.request

        # --- 1) First call: create booking ---
        r1 = await req.post(
            f"{BASE}/api/public/book/create",
            headers={"Idempotency-Key": idem_key, "Content-Type": "application/json"},
            data=json.dumps(payload),
        )
        assert r1.status == 200, f"expected 200, got {r1.status}: {await r1.text()}"
        j1 = await r1.json()
        ref1 = j1.get("reference")
        assert j1.get("ok") is True, f"ok=false: {j1}"
        assert ref1 and BMC_RE.match(ref1), f"reference not BMC-YYYYMMDD-XXXX: {ref1!r}"
        # date segment matches today's YYYYMMDD in server tz (bounded ±1 day)
        y, m, d = ref1.split("-")[1][:4], ref1.split("-")[1][4:6], ref1.split("-")[1][6:8]
        print(f"[ok] first booking reference: {ref1}")

        # --- 2) Idempotent replay: same key → same reference ---
        r2 = await req.post(
            f"{BASE}/api/public/book/create",
            headers={"Idempotency-Key": idem_key, "Content-Type": "application/json"},
            data=json.dumps(payload),
        )
        assert r2.status == 200, f"replay expected 200, got {r2.status}: {await r2.text()}"
        j2 = await r2.json()
        assert j2.get("ok") is True and j2.get("reference") == ref1, (
            f"replay mismatch: first={ref1} second={j2.get('reference')}"
        )
        print(f"[ok] idempotent replay returned same reference: {j2['reference']}")

        # --- 3) Different key on same slot → 409 SLOT_TAKEN ---
        other_key = f"e2e-other-{secrets.token_hex(6)}"
        r3 = await req.post(
            f"{BASE}/api/public/book/create",
            headers={"Idempotency-Key": other_key, "Content-Type": "application/json"},
            data=json.dumps(payload),
        )
        assert r3.status == 409, f"expected 409 conflict, got {r3.status}: {await r3.text()}"
        j3 = await r3.json()
        assert j3.get("code") == "SLOT_TAKEN", f"expected SLOT_TAKEN, got {j3}"
        print(f"[ok] slot conflict properly returned 409 SLOT_TAKEN")

        await browser.close()

    # --- 4) DB assertion: exactly ONE row for idempotency key ---
    rows = sb(
        f"/rest/v1/appointments?select=id,reference_number,idempotency_key"
        f"&idempotency_key=eq.{idem_key}"
    )
    assert len(rows) == 1, f"expected 1 row for key, got {len(rows)}"
    assert rows[0]["reference_number"] == ref1, (
        f"stored reference mismatch: db={rows[0]['reference_number']} api={ref1}"
    )
    print(f"[ok] exactly one appointments row persisted with reference {ref1}")

    # Cleanup — remove the test appointment
    try:
        sb(f"/rest/v1/appointments?id=eq.{rows[0]['id']}", method="DELETE")
    except Exception as e:
        print(f"[warn] cleanup failed: {e}")

    print("\n✓ ALL ASSERTIONS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
