#!/usr/bin/env python3
"""CI gate: trigger a Performance Budgets sweep and fail if new breaches
were recorded this hour. Requires PERF_CRON_URL and PERF_CRON_SECRET.

Exit codes:
  0  no new breaches
  1  breaches detected (CI should mark job failed)
  2  invocation error (misconfigured / network)
"""
from __future__ import annotations
import json, os, sys, urllib.request, urllib.error

URL = os.environ.get("PERF_CRON_URL", "").strip()
SECRET = os.environ.get("PERF_CRON_SECRET", "").strip()
ALLOW_BREACH = os.environ.get("PERF_ALLOW_BREACH", "0") == "1"

if not URL or not SECRET:
    print("PERF_CRON_URL or PERF_CRON_SECRET missing", file=sys.stderr)
    sys.exit(2)

req = urllib.request.Request(
    URL,
    method="POST",
    headers={"Authorization": f"Bearer {SECRET}", "Content-Type": "application/json"},
    data=b"{}",
)
try:
    with urllib.request.urlopen(req, timeout=60) as res:
        body = res.read().decode("utf-8", errors="replace")
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:200]}", file=sys.stderr)
    sys.exit(2)
except Exception as e:
    print(f"request failed: {e}", file=sys.stderr)
    sys.exit(2)

try:
    data = json.loads(body)
except Exception:
    print(f"non-JSON response: {body[:200]}", file=sys.stderr)
    sys.exit(2)

print(json.dumps(data, ensure_ascii=False, indent=2))
if not data.get("ok"):
    sys.exit(2)

new_alerts = int(data.get("new_alerts") or 0)
breaches = int(data.get("breaches") or 0)
if new_alerts > 0:
    print(f"::error::Perf budget breach — {new_alerts} new alert(s), {breaches} total breaches")
    sys.exit(0 if ALLOW_BREACH else 1)

print(f"OK — scanned={data.get('scanned')} breaches={breaches}")
sys.exit(0)
