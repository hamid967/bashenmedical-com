/**
 * Public API — /api/public/book/hold
 *
 * POST   → create or refresh a 5-minute slot hold for the current session.
 *          Body: { doctor_id, appointment_date, appointment_time, branch_id?, session_id }
 *          Returns: { ok, id, expires_at } | { ok:false, kind, message }
 *
 * DELETE → release a hold owned by the current session.
 *          Body: { session_id, id? }
 *          Returns: { ok:true, released:number }
 *
 * Holds are short-lived reservations shown to the patient as a visible
 * countdown while they finish the wizard. The authoritative anti-double-book
 * guard is still the partial UNIQUE index on `appointments`; holds are a UX
 * layer that also prevents a second visitor from picking a slot someone is
 * actively booking (see availability.ts, which treats active holds as busy).
 *
 * Uses the admin client so the anon RLS policies stay narrow while the
 * endpoint remains callable from the public /book wizard.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

const HOLD_MINUTES = 5;

const holdSchema = z.object({
  doctor_id: z.string().uuid(),
  branch_id: z.string().uuid().optional().nullable(),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  appointment_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  session_id: z.string().min(8).max(128),
});

const releaseSchema = z.object({
  session_id: z.string().min(8).max(128),
  id: z.string().uuid().optional(),
});

// --- Ad-hoc in-memory rate limiter --------------------------------------
// Workers are stateless across instances, so this is best-effort per worker;
// still blocks the common bursty-abuse pattern from a single client.
// Limits per key (ip + session_id):
//   POST:   10 req / 60s   AND   30 req / 300s
//   DELETE: 30 req / 60s
type Bucket = number[];
const RL_BUCKETS: Map<string, Bucket> =
  (globalThis as unknown as { __holdRlBuckets?: Map<string, Bucket> }).__holdRlBuckets ??
  new Map<string, Bucket>();
(globalThis as unknown as { __holdRlBuckets?: Map<string, Bucket> }).__holdRlBuckets = RL_BUCKETS;

type RLRule = { windowMs: number; max: number };
function checkRateLimit(
  key: string,
  rules: RLRule[],
): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const maxWindow = Math.max(...rules.map((r) => r.windowMs));
  const arr = (RL_BUCKETS.get(key) ?? []).filter((t) => now - t < maxWindow);
  for (const rule of rules) {
    const inWindow = arr.filter((t) => now - t < rule.windowMs);
    if (inWindow.length >= rule.max) {
      const oldest = inWindow.sort((a, b) => a - b)[0] ?? now;
      const retryAfter = Math.max(1, Math.ceil((rule.windowMs - (now - oldest)) / 1000));
      RL_BUCKETS.set(key, arr);
      return { ok: false, retryAfter };
    }
  }
  arr.push(now);
  RL_BUCKETS.set(key, arr);
  if (RL_BUCKETS.size > 5000 && Math.random() < 0.02) {
    for (const [k, v] of RL_BUCKETS) {
      const kept = v.filter((t) => now - t < maxWindow);
      if (kept.length === 0) RL_BUCKETS.delete(k);
      else RL_BUCKETS.set(k, kept);
    }
  }
  return { ok: true };
}

function clientKey(sessionId?: string): string {
  let ip = "";
  try {
    ip = getRequestIP({ xForwardedFor: true }) ?? "";
  } catch {
    /* noop */
  }
  if (!ip) {
    try {
      ip = (getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-real-ip") ?? "").toString();
    } catch {
      /* noop */
    }
  }
  return `${ip || "unknown"}::${sessionId || "no-session"}`;
}

function json(
  status: number,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...(extraHeaders ?? {}) },
  });
}

function rateLimited(retryAfter: number) {
  return json(
    429,
    { ok: false, kind: "rate_limited", message: "too_many_requests", retry_after: retryAfter },
    { "Retry-After": String(retryAfter) },
  );
}

export const Route = createFileRoute("/api/public/book/hold")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, { ok: false, kind: "validation", message: "invalid_json" });
        }
        const parsed = holdSchema.safeParse(body);
        if (!parsed.success) {
          return json(400, {
            ok: false,
            kind: "validation",
            message: parsed.error.issues[0]?.message ?? "invalid",
          });
        }
        const { doctor_id, branch_id, appointment_date, appointment_time, session_id } =
          parsed.data;

        const rl = checkRateLimit(`hold:post:${clientKey(session_id)}`, [
          { windowMs: 60_000, max: 10 },
          { windowMs: 300_000, max: 30 },
        ]);
        if (!rl.ok) return rateLimited(rl.retryAfter);

        const timeHHMMSS =
          appointment_time.length === 5 ? `${appointment_time}:00` : appointment_time;
        const expires_at = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const nowIso = new Date().toISOString();

          // Best-effort cleanup: release this session's older active holds
          // so browsing several slots doesn't accumulate a queue of holds.
          await supabaseAdmin
            .from("slot_holds")
            .update({ released_at: nowIso })
            .eq("session_id", session_id)
            .is("released_at", null);

          // Release ANY expired-but-not-yet-released hold on the target slot
          // so the partial unique index `slot_holds_active_uidx` (WHERE
          // released_at IS NULL) doesn't block a fresh hold on a stale row.
          await supabaseAdmin
            .from("slot_holds")
            .update({ released_at: nowIso })
            .eq("doctor_id", doctor_id)
            .eq("appointment_date", appointment_date)
            .eq("appointment_time", timeHHMMSS)
            .is("released_at", null)
            .lte("expires_at", nowIso);

          // If the same slot still has an unexpired hold owned by a different
          // session, block. A real appointment on that slot also blocks.
          const { data: activeHolds } = await supabaseAdmin
            .from("slot_holds")
            .select("id,session_id,expires_at")
            .eq("doctor_id", doctor_id)
            .eq("appointment_date", appointment_date)
            .eq("appointment_time", timeHHMMSS)
            .is("released_at", null)
            .gt("expires_at", nowIso);
          const foreign = (activeHolds ?? []).find((h) => h.session_id !== session_id);
          if (foreign) {
            return json(409, { ok: false, kind: "conflict", message: "held_by_other" });
          }

          const { data: appts } = await supabaseAdmin
            .from("appointments")
            .select("id,status")
            .eq("doctor_id", doctor_id)
            .eq("appointment_date", appointment_date)
            .eq("appointment_time", timeHHMMSS);
          const taken = (appts ?? []).some(
            (a) => a.status !== "cancelled" && a.status !== "no_show",
          );
          if (taken) {
            return json(409, { ok: false, kind: "conflict", message: "already_booked" });
          }

          const { data: inserted, error } = await supabaseAdmin
            .from("slot_holds")
            .insert({
              doctor_id,
              branch_id: branch_id ?? null,
              appointment_date,
              appointment_time: timeHHMMSS,
              session_id,
              expires_at,
            })
            .select("id,expires_at")
            .maybeSingle();

          if (error) {
            // Race: two concurrent holders lost to the partial unique index
            // `slot_holds_active_uidx`. Postgres returns 23505 → surface as
            // a clean 409 so the client can pick another slot.
            const code = (error as { code?: string }).code;
            if (code === "23505") {
              return json(409, { ok: false, kind: "conflict", message: "held_by_other" });
            }
            return json(500, { ok: false, kind: "db", message: error.message ?? "hold_failed" });
          }
          if (!inserted) {
            return json(500, { ok: false, kind: "db", message: "hold_failed" });
          }
          return json(200, { ok: true, id: inserted.id, expires_at: inserted.expires_at });
        } catch (e) {
          return json(500, { ok: false, kind: "db", message: (e as Error)?.message ?? "unknown" });
        }
      },

      DELETE: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, { ok: false, message: "invalid_json" });
        }
        const parsed = releaseSchema.safeParse(body);
        if (!parsed.success) return json(400, { ok: false, message: "invalid" });

        const rl = checkRateLimit(`hold:del:${clientKey(parsed.data.session_id)}`, [
          { windowMs: 60_000, max: 30 },
        ]);
        if (!rl.ok) return rateLimited(rl.retryAfter);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          let q = supabaseAdmin
            .from("slot_holds")
            .update({ released_at: new Date().toISOString() })
            .eq("session_id", parsed.data.session_id)
            .is("released_at", null);
          if (parsed.data.id) q = q.eq("id", parsed.data.id);
          const { data, error } = await q.select("id");
          if (error) return json(500, { ok: false, message: error.message });
          return json(200, { ok: true, released: data?.length ?? 0 });
        } catch (e) {
          return json(500, { ok: false, message: (e as Error)?.message ?? "unknown" });
        }
      },
    },
  },
});
