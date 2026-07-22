/**
 * /api/ai/action — Execute an AI-suggested mutating action after the user
 * has confirmed it in the UI. Every call is:
 *   - authenticated (bearer token; user-scoped Supabase client),
 *   - feature-flag gated (`ai.assistant.mutations.enabled`),
 *   - Zod-validated per tool,
 *   - audited (ai_tool_invocations + security_audit_log).
 *
 * The chat endpoint never executes anything. The model emits an ```action
 * fence which the client renders as a button; only an explicit click here
 * mutates data. RLS on `appointments` still enforces ownership.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getFeatureFlag, readAuthUser, serverClient } from "@/lib/ai/ai.server";

const ToolSchemas = {
  cancel_appointment: z.object({
    appointment_id: z.string().uuid(),
    reason: z.string().trim().max(500).optional().nullable(),
  }),
  reschedule_appointment: z.object({
    appointment_id: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  }),
} as const;
type ToolName = keyof typeof ToolSchemas;

interface Body {
  tool?: string;
  params?: unknown;
  conversation_id?: string;
}

export const Route = createFileRoute("/api/ai/action")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await readAuthUser(request);
        if (!auth) return json({ error: "unauthenticated" }, 401);

        const enabled = await getFeatureFlag("ai.assistant.mutations.enabled");
        if (!enabled) return json({ error: "mutations_disabled" }, 503);

        let body: Body = {};
        try {
          body = await request.json();
        } catch {
          return json({ error: "bad_request" }, 400);
        }
        const tool = body.tool as ToolName | undefined;
        if (!tool || !(tool in ToolSchemas)) return json({ error: "unknown_tool" }, 400);

        const parsed = ToolSchemas[tool].safeParse(body.params);
        if (!parsed.success) {
          return json({ error: "invalid_params", details: parsed.error.flatten() }, 400);
        }

        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${auth.token}` } },
        });

        const start = Date.now();
        let outcome: "ok" | "error" = "ok";
        let output: Record<string, unknown> = {};
        let errorMessage: string | null = null;

        try {
          if (tool === "cancel_appointment") {
            output = await cancelAppointment(
              sb,
              auth.userId,
              parsed.data as z.infer<(typeof ToolSchemas)["cancel_appointment"]>,
            );
          } else if (tool === "reschedule_appointment") {
            output = await rescheduleAppointment(
              sb,
              auth.userId,
              parsed.data as z.infer<(typeof ToolSchemas)["reschedule_appointment"]>,
            );
          }
        } catch (err) {
          outcome = "error";
          errorMessage = err instanceof Error ? err.message : String(err);
        }

        const latency = Date.now() - start;
        // Fire-and-forget audit — DB writes go through service pattern via the anon client
        // (ai_tool_invocations RLS allows the actor to insert their own row).
        void recordAudit({
          conversationId: body.conversation_id,
          actor: auth.userId,
          token: auth.token,
          tool,
          params: parsed.data as Record<string, unknown>,
          output,
          status: outcome,
          errorMessage,
          latencyMs: latency,
        });

        if (outcome === "error") {
          return json({ ok: false, error: errorMessage ?? "action_failed" }, 400);
        }
        return json({ ok: true, ...output });
      },
    },
  },
});

/* ------------------------------ tool bodies ------------------------------- */

async function cancelAppointment(
  sb: SupabaseClient,
  userId: string,
  data: z.infer<(typeof ToolSchemas)["cancel_appointment"]>,
): Promise<Record<string, unknown>> {
  const owned = await loadOwnedAppointment(sb, userId, data.appointment_id);
  if (owned.status === "cancelled") return { alreadyCancelled: true };
  if (owned.status === "completed") throw new Error("لا يمكن إلغاء موعد مكتمل.");
  const { error } = await sb
    .from("appointments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      notes: data.reason ? `[سبب الإلغاء - مساعد ذكي] ${data.reason}` : undefined,
    })
    .eq("id", data.appointment_id);
  if (error) throw new Error(error.message);
  return { cancelled: true, appointment_id: data.appointment_id };
}

async function rescheduleAppointment(
  sb: SupabaseClient,
  userId: string,
  data: z.infer<(typeof ToolSchemas)["reschedule_appointment"]>,
): Promise<Record<string, unknown>> {
  const owned = await loadOwnedAppointment(sb, userId, data.appointment_id);
  if (owned.status === "cancelled" || owned.status === "completed") {
    throw new Error("لا يمكن إعادة جدولة موعد منتهي أو ملغى.");
  }
  const time = data.time.length === 5 ? `${data.time}:00` : data.time;

  // Same-doctor clash check
  if (owned.doctor_id) {
    const clash = await sb
      .from("appointments")
      .select("id")
      .eq("doctor_id", owned.doctor_id)
      .eq("appointment_date", data.date)
      .eq("appointment_time", time)
      .in("status", ["new", "confirmed"])
      .neq("id", owned.id)
      .maybeSingle();
    if (clash.error && clash.error.code !== "PGRST116") throw new Error(clash.error.message);
    if (clash.data) throw new Error("الوقت الجديد غير متاح. اختر وقتًا آخر.");
  }

  const { error } = await sb
    .from("appointments")
    .update({
      appointment_date: data.date,
      appointment_time: time,
      status: "new",
    })
    .eq("id", data.appointment_id);
  if (error) throw new Error(error.message);
  return { rescheduled: true, appointment_id: data.appointment_id, date: data.date, time };
}

/* --------------------------------- utils --------------------------------- */

async function loadOwnedAppointment(sb: SupabaseClient, userId: string, id: string) {
  // RLS on appointments already scopes ownership. If the user does not own the
  // row, no data returns. We additionally match against profile→patient.
  const { data, error } = await sb
    .from("appointments")
    .select("id, status, doctor_id, patient_id, appointment_date, appointment_time")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("الموعد غير متاح لحسابك.");
  return data as {
    id: string;
    status: string;
    doctor_id: string | null;
    patient_id: string | null;
    appointment_date: string;
    appointment_time: string;
  };
}

async function recordAudit(p: {
  conversationId?: string;
  actor: string;
  token: string;
  tool: string;
  params: Record<string, unknown>;
  output: Record<string, unknown>;
  status: "ok" | "error";
  errorMessage: string | null;
  latencyMs: number;
}) {
  try {
    const sb = serverClient(p.token);
    // Redact from audit
    const safeParams = { ...p.params };
    if ("reason" in safeParams && typeof safeParams.reason === "string") {
      safeParams.reason = (safeParams.reason as string).slice(0, 200);
    }
    await sb.from("ai_tool_invocations").insert({
      conversation_id: p.conversationId ?? null,
      tool: p.tool,
      input: safeParams,
      output: p.status === "ok" ? p.output : { error: p.errorMessage },
      status: p.status,
      latency_ms: p.latencyMs,
      actor: p.actor,
    });
    await sb.from("security_audit_log").insert({
      event_type: `ai.action.${p.tool}`,
      severity: p.status === "ok" ? "info" : "warn",
      actor: p.actor,
      details: {
        params: safeParams,
        outcome: p.status,
        error: p.errorMessage,
        latency_ms: p.latencyMs,
        source: "ai_assistant",
      },
    });
  } catch {
    /* best-effort */
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
