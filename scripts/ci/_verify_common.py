"""
Shared helpers for CI preflight `verify-e2e-*-fixtures.py` scripts.

Consolidates:
  - env validation & Supabase client config
  - REST request helper (GET/POST/PATCH/DELETE) with service-role auth
  - consistent [tag][FAIL]/[OK] logging
  - reusable fixture lookups (branch, specialty, doctor, doctor_branches link)
  - auth admin user lookup by email

Each verify script owns its own scenario-specific assertions but delegates
generic wiring to this module to remove duplication.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass


# ------------------------------- env ---------------------------------------

def require_env(keys: list[str], tag: str) -> dict[str, str]:
    """Exit(1) with a clear Arabic message if any key is missing/empty."""
    missing = [k for k in keys if not os.environ.get(k, "").strip()]
    if missing:
        print(f"[{tag}] متغيّرات مفقودة: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)
    return {k: os.environ[k].strip() for k in keys}


# ------------------------------- client ------------------------------------

@dataclass
class SupaClient:
    """Minimal Supabase REST client bound to a service-role key."""

    url: str
    service_key: str
    tag: str
    fail_hint: str | None = None

    def _headers(self, extra: dict | None = None) -> dict:
        h = {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if extra:
            h.update(extra)
        return h

    def request(self, path: str, method: str = "GET", body=None,
                extra_headers: dict | None = None) -> tuple[int, str]:
        url = f"{self.url}{path}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            url, data=data, method=method, headers=self._headers(extra_headers)
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                return resp.status, resp.read().decode() or ""
        except urllib.error.HTTPError as e:
            body_txt = ""
            try:
                body_txt = e.read().decode(errors="ignore")
            except Exception:
                pass
            return e.code, body_txt

    # convenience wrappers -------------------------------------------------

    def get(self, path: str, params: dict[str, str] | None = None) -> tuple[int, str]:
        if params:
            path = f"{path}?{urllib.parse.urlencode(params)}"
        return self.request(path, "GET")

    def post(self, path: str, body, prefer: str = "return=representation") -> tuple[int, str]:
        return self.request(path, "POST", body=body, extra_headers={"Prefer": prefer})

    def patch(self, path: str, body, prefer: str = "return=representation") -> tuple[int, str]:
        return self.request(path, "PATCH", body=body, extra_headers={"Prefer": prefer})

    def delete(self, path: str) -> tuple[int, str]:
        return self.request(path, "DELETE")

    # error / result helpers ----------------------------------------------

    def fail(self, msg: str) -> None:
        print(f"[{self.tag}][FAIL] {msg}", file=sys.stderr)
        if self.fail_hint:
            print(f"→ {self.fail_hint}", file=sys.stderr)
        sys.exit(1)

    def rows(self, res: tuple[int, str], label: str) -> list[dict]:
        status, body = res
        if status >= 300:
            self.fail(f"{label}: HTTP {status} — {body[:300]}")
        try:
            return json.loads(body or "[]")
        except json.JSONDecodeError:
            self.fail(f"{label}: JSON غير صالح — {body[:200]}")
            return []  # unreachable

    def first(self, res: tuple[int, str], label: str) -> dict:
        rows = self.rows(res, label)
        if not rows:
            self.fail(f"{label}: لا صفوف عائدة")
        return rows[0]

    def ok(self, msg: str) -> None:
        print(f"[{self.tag}] OK — {msg}")

    # factory --------------------------------------------------------------

    @classmethod
    def from_env(cls, tag: str, extra_required: list[str] | None = None,
                 fail_hint: str | None = None) -> tuple["SupaClient", dict[str, str]]:
        keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] + list(extra_required or [])
        env = require_env(keys, tag)
        client = cls(
            url=env["SUPABASE_URL"].rstrip("/"),
            service_key=env["SUPABASE_SERVICE_ROLE_KEY"],
            tag=tag,
            fail_hint=fail_hint,
        )
        return client, env


# ------------------------------- fixtures ----------------------------------

def get_branch(cli: SupaClient, slug: str, select: str = "id,slug,name_ar") -> dict:
    return cli.first(
        cli.get("/rest/v1/branches", {"select": select, "slug": f"eq.{slug}"}),
        f"branch fixture '{slug}'",
    )


def get_specialty(cli: SupaClient, slug: str, select: str = "id,slug") -> dict:
    return cli.first(
        cli.get("/rest/v1/specialties", {"select": select, "slug": f"eq.{slug}"}),
        f"specialty fixture '{slug}'",
    )


def get_doctor(cli: SupaClient, slug: str,
               select: str = "id,slug,name_ar,specialty_id,branch_id") -> dict:
    return cli.first(
        cli.get("/rest/v1/doctors", {"select": select, "slug": f"eq.{slug}"}),
        f"doctor fixture '{slug}'",
    )


def require_doctor_branch_link(cli: SupaClient, doctor_id: str, branch_id: str) -> None:
    rows = cli.rows(
        cli.get("/rest/v1/doctor_branches", {
            "select": "doctor_id,branch_id",
            "doctor_id": f"eq.{doctor_id}",
            "branch_id": f"eq.{branch_id}",
        }),
        "doctor_branches link",
    )
    if not rows:
        cli.fail("doctor_branches: لا يوجد ربط للطبيب E2E بالفرع E2E.")


def get_e2e_bundle(cli: SupaClient, *, branch_slug: str = "e2e-branch",
                   spec_slug: str = "e2e-specialty",
                   doctor_slug: str = "e2e-doctor",
                   require_link: bool = True) -> tuple[dict, dict, dict]:
    """Load (branch, specialty, doctor) and optionally assert the join."""
    branch = get_branch(cli, branch_slug)
    spec = get_specialty(cli, spec_slug)
    doctor = get_doctor(cli, doctor_slug)
    if doctor.get("specialty_id") != spec["id"]:
        cli.fail(
            f"الطبيب '{doctor_slug}' غير مرتبط بالتخصص '{spec_slug}' "
            f"(specialty_id={doctor.get('specialty_id')})."
        )
    if require_link:
        require_doctor_branch_link(cli, doctor["id"], branch["id"])
    return branch, spec, doctor


# ------------------------------- auth admin --------------------------------

def find_admin_user_id(cli: SupaClient, email: str) -> str:
    """Look up an auth.users row by email via the Admin API. Fails otherwise."""
    q = urllib.parse.urlencode({"email": email})
    status, body = cli.request(f"/auth/v1/admin/users?{q}")
    if status >= 300:
        cli.fail(f"auth admin users: HTTP {status} — {body[:300]}")
    try:
        payload = json.loads(body or "{}")
    except json.JSONDecodeError:
        cli.fail(f"auth admin users: JSON غير صالح — {body[:200]}")
        return ""  # unreachable
    users = payload.get("users") if isinstance(payload, dict) else payload
    users = users or []
    found = [
        u for u in users
        if str(u.get("email", "")).lower() == email.lower()
    ]
    if not found:
        cli.fail(f"مستخدم E2E admin '{email}' غير موجود في auth.users.")
    return found[0]["id"]


# ------------------------------- runner ------------------------------------

def run(main_fn, cli: SupaClient) -> None:
    """Wrap main() with uniform error handling."""
    try:
        main_fn()
    except SystemExit:
        raise
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode()
        except Exception:
            pass
        cli.fail(f"HTTP {e.code}: {body[:400]}")
    except Exception as e:  # noqa: BLE001
        cli.fail(f"exception: {e}")
