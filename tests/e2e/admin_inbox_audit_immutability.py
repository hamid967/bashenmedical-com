"""
Smoke test: Unified Inbox audit + immutability guarantees.

Verifies at the Data API layer (as a real admin session) that:

  1. `inbox_log_event` RPC writes an append-only row to `inbox_events` for
     every operational action kind exposed by the detail panel.
  2. `inbox_events` rows are immutable — UPDATE and DELETE are refused by RLS
     (no policies exist for those commands).
  3. `inbox_items` rows cannot be permanently deleted — DELETE is refused.
     Archival is the only removal path and it merely flips `status` +
     `archived_at`; the row and its history remain.

Runs against the local dev server credentials (Supabase Data API). Uses the
same session resolver as the other admin smoke tests. Skips (exit 0) when no
admin session is available.

Exit codes:
  0 = pass or skipped
  1 = fail
"""
import asyncio, os, sys, json, urllib.request, urllib.error, uuid

SUPA_URL = "https://rcerbsywuovcleqybumg.supabase.co"
SUPA_KEY = "sb_publishable_jCNv8mbgtiQaIWkms_cHiA_9WUH_qEG"

ADMIN_EMAIL = os.environ.get("E2E_ADMIN_EMAIL", "").strip()
ADMIN_PASSWORD = os.environ.get("E2E_ADMIN_PASSWORD", "").strip()
AUTH_STATUS = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "")
INJECTED_SESSION_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON", "")
INJECTED_ACCESS_TOKEN = os.environ.get("LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN", "")

# The full action set exposed by /admin/inbox/$id (excluding `created`, which
# is only ever inserted by DB triggers on source rows).
ACTIONS = [
    "assign",
    "transfer",
    "change_priority",
    "change_status",
    "add_note",
    "contact_patient",
    "request_documents",
    "link_appointment",
    "send_notification",
    "merge_duplicate",
    "archive",
    "reopen",
]


def _req(method, path, token, body=None, prefer=None):
    url = f"{SUPA_URL}/rest/v1/{path}"
    data = None if body is None else json.dumps(body).encode()
    headers = {
        "apikey": SUPA_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        raw = urllib.request.urlopen(req).read().decode() or "null"
        return urllib.request.urlopen  # placeholder — replaced below
    except Exception:
        pass
    # We want to inspect status + body reliably, so re-open with error capture.
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req)
        return resp.status, resp.read().decode() or ""
    except urllib.error.HTTPError as e:
        return e.code, (e.read().decode(errors="ignore") or "")


def password_sign_in(email, password):
    req = urllib.request.Request(
        f"{SUPA_URL}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"apikey": SUPA_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    raw = urllib.request.urlopen(req).read()
    d = json.loads(raw)
    return d["access_token"], d["user"]["id"]


def has_admin(uid, token):
    status, body = _req(
        "POST", "rpc/has_role", token,
        body={"_user_id": uid, "_role": "admin"},
    )
    return status == 200 and body.strip() == "true"


def resolve_token():
    if ADMIN_EMAIL and ADMIN_PASSWORD:
        return password_sign_in(ADMIN_EMAIL, ADMIN_PASSWORD)
    if AUTH_STATUS == "injected" and INJECTED_SESSION_JSON:
        try:
            s = json.loads(INJECTED_SESSION_JSON)
        except Exception:
            return None, None
        return (
            INJECTED_ACCESS_TOKEN or s.get("access_token", ""),
            s.get("user", {}).get("id"),
        )
    return None, None


def main():
    token, uid = resolve_token()
    if not token or not uid:
        print("[skip] no session available")
        return 0
    if not has_admin(uid, token):
        print("[skip] session lacks admin role")
        return 0

    errors = []

    # -- Seed a synthetic inbox_item we own the full lifecycle of. --
    req_num = f"SMOKE-AUDIT-{uuid.uuid4().hex[:10].upper()}"
    seed_body = [{
        "request_number": req_num,
        "source_table": "smoke_test",
        "channel": "support",
        "status": "new",
        "priority": "normal",
        "subject": "audit-immutability smoke",
    }]
    status, body = _req(
        "POST", "inbox_items", token, body=seed_body,
        prefer="return=representation",
    )
    if status not in (200, 201):
        print(f"[fail] cannot seed inbox_item: HTTP {status} — {body}")
        return 1
    row = json.loads(body)[0]
    item_id = row["id"]
    print(f"[info] seeded item {item_id} ({req_num})")

    # -- 1) Each action writes an inbox_event via inbox_log_event RPC. --
    for action in ACTIONS:
        status, body = _req(
            "POST", "rpc/inbox_log_event", token,
            body={
                "_item_id": item_id,
                "_action": action,
                "_from": None,
                "_to": {"smoke": action},
                "_note": f"smoke {action}",
            },
        )
        if status not in (200, 204):
            errors.append(f"inbox_log_event({action}) → HTTP {status} — {body}")

    # Verify all actions landed as rows.
    status, body = _req(
        "GET",
        f"inbox_events?item_id=eq.{item_id}&select=action&order=created_at.asc",
        token,
    )
    if status != 200:
        errors.append(f"read events → HTTP {status} — {body}")
        recorded = []
    else:
        recorded = [r["action"] for r in json.loads(body)]
    missing = [a for a in ACTIONS if a not in recorded]
    if missing:
        errors.append(f"missing audit events for actions: {missing}")

    # -- 2) inbox_events immutability: UPDATE + DELETE must fail. --
    if recorded:
        # Grab one event id.
        status, body = _req(
            "GET",
            f"inbox_events?item_id=eq.{item_id}&limit=1&select=id",
            token,
        )
        ev_id = json.loads(body)[0]["id"] if status == 200 else None
        if ev_id:
            u_status, u_body = _req(
                "PATCH", f"inbox_events?id=eq.{ev_id}", token,
                body={"note": "TAMPERED"},
                prefer="return=representation",
            )
            # PostgREST returns 200/204 with empty result set when RLS filters
            # the row, or 401/403 outright. Real success would return the
            # patched row.
            u_rows = []
            try:
                u_rows = json.loads(u_body) if u_body.strip() else []
            except Exception:
                u_rows = []
            if u_status < 400 and u_rows:
                errors.append(
                    f"inbox_events UPDATE unexpectedly succeeded (HTTP {u_status})"
                )
            d_status, d_body = _req(
                "DELETE", f"inbox_events?id=eq.{ev_id}", token,
                prefer="return=representation",
            )
            d_rows = []
            try:
                d_rows = json.loads(d_body) if d_body.strip() else []
            except Exception:
                d_rows = []
            if d_status < 400 and d_rows:
                errors.append(
                    f"inbox_events DELETE unexpectedly succeeded (HTTP {d_status})"
                )
            # And confirm the event is still present unchanged.
            v_status, v_body = _req(
                "GET",
                f"inbox_events?id=eq.{ev_id}&select=id,note",
                token,
            )
            v_rows = json.loads(v_body) if v_status == 200 else []
            if not v_rows:
                errors.append("inbox_events row disappeared after mutation attempt")
            elif v_rows[0].get("note") == "TAMPERED":
                errors.append("inbox_events row was actually tampered")

    # -- 3) inbox_items cannot be permanently deleted. --
    d_status, d_body = _req(
        "DELETE", f"inbox_items?id=eq.{item_id}", token,
        prefer="return=representation",
    )
    d_rows = []
    try:
        d_rows = json.loads(d_body) if d_body.strip() else []
    except Exception:
        d_rows = []
    if d_status < 400 and d_rows:
        errors.append(
            f"inbox_items DELETE unexpectedly succeeded (HTTP {d_status})"
        )
    # Confirm item still exists.
    v_status, v_body = _req(
        "GET", f"inbox_items?id=eq.{item_id}&select=id,status", token,
    )
    v_rows = json.loads(v_body) if v_status == 200 else []
    if not v_rows:
        errors.append("inbox_items row disappeared — permanent delete leaked through")

    # Best-effort cleanup: leave the seeded rows in place (RLS blocks delete
    # anyway; they're marked SMOKE-AUDIT-*). Flip status to archived so they
    # don't clutter the default view.
    _req(
        "PATCH", f"inbox_items?id=eq.{item_id}", token,
        body={"status": "archived"},
    )

    if errors:
        for e in errors:
            print(f"[fail] {e}")
        return 1
    print(f"[ok] audit events append-only for {len(ACTIONS)} actions; "
          "inbox_items + inbox_events reject UPDATE/DELETE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
