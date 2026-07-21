"""
E2E test — Rollback scenario in a sandboxed environment.

Simulates a 403 spike after a deployment marker, invokes the watchdog RPC
directly against the live DB in an isolated transaction, and verifies:

1. Baseline 401/403 rate is captured cleanly.
2. Injected error rows push the 15-minute rate above the rollback threshold.
3. `evaluate_permission_error_spike()` classifies severity='rollback'.
4. A `rollback_recommendations` row is created linked to the deployment.
5. Simulated ack (status='rolled_back') closes the loop; a follow-up
   watchdog tick with errors purged returns severity='warn' or below,
   confirming the system re-stabilizes.

Isolation: all writes happen inside a single transaction that is ROLLED
BACK at the end — no test data leaks into production tables. This test is
safe to run against the live DB on every push.

Requires PGHOST/PGPASSWORD env (same secrets as the security-secdef-guard job).
Skipped locally if PGHOST is unset.
"""
from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import psycopg2
import psycopg2.extras


BASELINE_HOURS = 168  # 7-day baseline window used by evaluate_permission_error_spike
INJECT_ROUTES = [
    ("rpc/book_appointment_atomic", 403, "anon"),
    ("rpc/estimate_appointment_cost", 403, "anon"),
    ("rpc/lookup_appointment", 403, "anon"),
    ("/api/public/inquiries/create", 403, "anon"),
]
INJECT_HITS_PER_ROUTE = 30  # 4 * 30 = 120 hits in a 15-min window → far above min_observed=5
ROLLBACK_RATIO_THRESHOLD = 6.0


def log(msg: str) -> None:
    print(f"  {msg}", flush=True)


def run() -> int:
    if not os.environ.get("PGHOST"):
        print("⚠  PGHOST not set — skipping rollback E2E (expected in local dev).")
        return 0

    conn = psycopg2.connect(sslmode=os.environ.get("PGSSLMODE", "require"))
    conn.autocommit = False
    failures: list[str] = []

    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            print("→ Step 1: open transaction & snapshot pre-state")
            cur.execute("BEGIN")
            cur.execute("SELECT count(*) AS n FROM api_permission_errors")
            pre_errors = cur.fetchone()["n"]
            cur.execute("SELECT count(*) AS n FROM rollback_recommendations")
            pre_recs = cur.fetchone()["n"]
            log(f"pre-state: {pre_errors} errors, {pre_recs} recommendations")

            print("→ Step 2: register a fresh deployment marker")
            fake_ref = f"e2e_rollback_{uuid.uuid4().hex[:8]}"
            cur.execute(
                """
                INSERT INTO deployment_markers (migration_ref, notes, baseline_per_hour)
                VALUES (%s, 'e2e rollback drill', 0.5)
                RETURNING id, migration_ref, created_at
                """,
                (fake_ref,),
            )
            marker = cur.fetchone()
            log(f"marker id={marker['id']} ref={marker['migration_ref']}")

            print("→ Step 3: inject 403 spike within the 15-min window")
            now = datetime.now(timezone.utc)
            rows = []
            for route, status, role in INJECT_ROUTES:
                for i in range(INJECT_HITS_PER_ROUTE):
                    rows.append((
                        now - timedelta(seconds=i * 5),
                        status,
                        route,
                        role,
                        "42501",
                        "permission denied for function (simulated)",
                        fake_ref,
                    ))
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO api_permission_errors
                  (occurred_at, status_code, route, role_hint, sqlstate, message, release_ref)
                VALUES %s
                """,
                rows,
            )
            log(f"injected {len(rows)} 403 rows across {len(INJECT_ROUTES)} routes")

            print("→ Step 4: run evaluate_permission_error_spike() with default thresholds")
            cur.execute(
                "SELECT * FROM evaluate_permission_error_spike(3.0, %s, 5.0)",
                (ROLLBACK_RATIO_THRESHOLD,),
            )
            spikes = cur.fetchall()
            log(f"evaluator returned {len(spikes)} spike(s)")
            drill_spike = next(
                (s for s in spikes if s["migration_ref"] == fake_ref),
                None,
            )
            if drill_spike is None:
                failures.append(
                    "Evaluator did not surface the injected drill deployment. "
                    f"Got refs: {[s['migration_ref'] for s in spikes]}"
                )
            else:
                log(
                    f"drill spike: ratio={drill_spike['ratio']:.1f}× "
                    f"observed={drill_spike['observed']}/h severity={drill_spike['severity']}"
                )
                if drill_spike["severity"] != "rollback":
                    failures.append(
                        f"Expected severity='rollback', got '{drill_spike['severity']}' "
                        f"(ratio {drill_spike['ratio']}× must be ≥ {ROLLBACK_RATIO_THRESHOLD})"
                    )
                if drill_spike["ratio"] < ROLLBACK_RATIO_THRESHOLD:
                    failures.append(
                        f"Ratio {drill_spike['ratio']} below rollback threshold "
                        f"{ROLLBACK_RATIO_THRESHOLD}× — injection was too weak."
                    )

            print("→ Step 5: create the rollback recommendation (mirrors watchdog behavior)")
            if drill_spike is not None:
                cur.execute(
                    """
                    INSERT INTO rollback_recommendations
                      (deployment_id, baseline_per_hour, observed_per_hour,
                       ratio, severity, top_routes)
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                    RETURNING id, status, severity
                    """,
                    (
                        drill_spike["deployment_id"],
                        drill_spike["baseline"],
                        drill_spike["observed"],
                        drill_spike["ratio"],
                        drill_spike["severity"],
                        psycopg2.extras.Json(list(drill_spike["top_routes"])),
                    ),
                )
                rec = cur.fetchone()
                log(f"created rec id={rec['id']} status={rec['status']}")

                print("→ Step 6: simulate ack → status='rolled_back'")
                cur.execute(
                    """
                    UPDATE rollback_recommendations
                    SET status = 'rolled_back',
                        acknowledged_at = now()
                    WHERE id = %s
                    RETURNING status, acknowledged_at
                    """,
                    (rec["id"],),
                )
                ack = cur.fetchone()
                if ack["status"] != "rolled_back" or ack["acknowledged_at"] is None:
                    failures.append(f"Ack update did not persist: {ack}")
                else:
                    log(f"rec transitioned to status={ack['status']}")

                print("→ Step 7: purge injected errors → re-run evaluator → severity drops")
                cur.execute(
                    "DELETE FROM api_permission_errors WHERE release_ref = %s",
                    (fake_ref,),
                )
                cur.execute(
                    "SELECT * FROM evaluate_permission_error_spike(3.0, %s, 5.0)",
                    (ROLLBACK_RATIO_THRESHOLD,),
                )
                post_spikes = cur.fetchall()
                still_bad = [s for s in post_spikes if s["migration_ref"] == fake_ref]
                if still_bad:
                    failures.append(
                        f"Post-purge evaluator still flagged the drill deployment: "
                        f"{still_bad[0]['severity']} @ ratio {still_bad[0]['ratio']}"
                    )
                else:
                    log("post-purge: drill no longer flagged — system re-stabilized")

            print("→ Step 8: rollback transaction (no production side-effects)")
            cur.execute("ROLLBACK")

            cur.execute("SELECT count(*) AS n FROM api_permission_errors")
            post_errors = cur.fetchone()["n"]
            cur.execute("SELECT count(*) AS n FROM rollback_recommendations")
            post_recs = cur.fetchone()["n"]
            if post_errors != pre_errors:
                failures.append(f"Leaked errors: {pre_errors} → {post_errors}")
            if post_recs != pre_recs:
                failures.append(f"Leaked recs: {pre_recs} → {post_recs}")
            log(f"post-rollback isolation OK: {post_errors} errors, {post_recs} recs")

    except Exception as e:  # noqa: BLE001
        conn.rollback()
        print(f"\n❌ Exception during drill: {e}", file=sys.stderr)
        return 2
    finally:
        conn.close()

    if failures:
        print("\n❌ Rollback drill failed:")
        for f in failures:
            print(f"  • {f}")
        return 1

    print("\n✅ Rollback drill passed — spike detected, rec created, ack applied, "
          "system re-stabilized after purge, zero prod leak.")
    return 0


if __name__ == "__main__":
    sys.exit(run())
