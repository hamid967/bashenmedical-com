"""
CI helper: يحذف بيانات E2E الحجز بأمان.

يحذف فقط الصفوف المرتبطة بـ slugs التي تبدأ بـ 'e2e-'. يعمل بترتيب
الاعتماد لتجنّب FK failures، ولا يمس أي بيانات إنتاجية.

Safety guard: قبل أي DELETE يتحقّق أن كل ID تم استرجاعه فعلاً من
استعلام مقيّد بـ slug LIKE 'e2e-%'. إذا لم يجد fixtures → exit 0
(idempotent) بدون خطأ.

المتطلبات (env):
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

Exit codes: 0 دائمًا (لا نُفشِل الـ pipeline بسبب cleanup)
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
_missing = [k for k in REQUIRED if not os.environ.get(k, "").strip()]
if _missing:
    print(f"[cleanup] skip — env vars missing: {', '.join(_missing)}")
    sys.exit(0)

SUPA_URL = os.environ["SUPABASE_URL"].rstrip("/")
SRV_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip()

HEADERS = {
    "apikey": SRV_KEY,
    "Authorization": f"Bearer {SRV_KEY}",
    "Content-Type": "application/json",
}


def _req(method: str, path: str, *, params=None, body=None, extra_headers=None):
    url = f"{SUPA_URL}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={**HEADERS, **(extra_headers or {})},
    )
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read().decode()
            return res.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="ignore")
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = raw
        return e.code, parsed


def find_ids(table: str, slug_prefix: str, *, extra_select: str = "id") -> list[dict]:
    status, body = _req("GET", f"/rest/v1/{table}", params={
        "slug": f"like.{slug_prefix}%",
        "select": extra_select,
    })
    if status >= 300:
        print(f"[cleanup] warn: select {table} → {status} {body}")
        return []
    return body or []


def delete_where(table: str, filters: dict, *, safe_min_col: str | None = None) -> int:
    """DELETE with the given filter dict. Returns row count if reported."""
    if not filters:
        print(f"[cleanup] refuse unfiltered DELETE on {table}")
        return 0
    status, body = _req(
        "DELETE", f"/rest/v1/{table}",
        params=filters,
        extra_headers={"Prefer": "return=representation"},
    )
    if status >= 300:
        print(f"[cleanup] warn: delete {table} {filters} → {status} {body}")
        return 0
    count = len(body) if isinstance(body, list) else 0
    print(f"[cleanup] deleted {count:>4} rows from {table}  ({filters})")
    return count


def main():
    print(f"[cleanup] target: {SUPA_URL}")

    # 1. Resolve fixture IDs (only e2e-* slugs).
    doctors = find_ids("doctors", "e2e-")
    specialties = find_ids("specialties", "e2e-")
    branches = find_ids("branches", "e2e-")

    doctor_ids = [d["id"] for d in doctors]
    specialty_ids = [s["id"] for s in specialties]
    branch_ids = [b["id"] for b in branches]

    if not (doctor_ids or specialty_ids or branch_ids):
        print("[cleanup] no e2e-* fixtures found — nothing to do ✓")
        return

    # 2. Delete dependents first (respect FK order).
    #    availability_slots + appointments + slot_holds → doctor_id.
    if doctor_ids:
        doctor_filter = f"in.({','.join(doctor_ids)})"
        delete_where("appointments", {"doctor_id": doctor_filter})
        delete_where("slot_holds", {"doctor_id": doctor_filter})
        delete_where("availability_slots", {"doctor_id": doctor_filter})
        delete_where("doctor_branches", {"doctor_id": doctor_filter})

    # 3. Doctors themselves — always filtered by id, never by wildcard.
    if doctor_ids:
        delete_where("doctors", {"id": f"in.({','.join(doctor_ids)})"})

    # 4. Specialties — safe: nothing else FK-refs them except doctors (already gone).
    if specialty_ids:
        delete_where("specialties", {"id": f"in.({','.join(specialty_ids)})"})

    # 5. Branches — most FKs are ON DELETE SET NULL, but the e2e branch
    #    has no production dependents; safe to remove.
    if branch_ids:
        delete_where("branches", {"id": f"in.({','.join(branch_ids)})"})

    print("[cleanup] done ✓")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Never fail the pipeline on cleanup — just report.
        print(f"[cleanup] soft-fail: {exc}")
    sys.exit(0)
