/**
 * Human escalation path — Baeshen AI assistant (Phase 10).
 *
 * A patient (own conversation) or staff member can escalate an AI chat to
 * the unified inbox for human handling. One RPC call creates:
 *   - `inbox_items` row (channel = ai_assistant, source = ai_conversations)
 *   - `ai_safety_incidents` row (kind = human_escalation) linked to it
 *   - `inbox_events` audit row on the ticket
 *
 * Everything is atomic inside `escalate_ai_to_inbox` and enforced under the
 * caller's Supabase session (RLS/role check inside the SECURITY DEFINER fn).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyRateLimit } from "@/lib/v3/rate-limit-unified.server";

const Input = z.object({
  conversationId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  lang: z.enum(["ar", "en"]).optional(),
  summary: z.string().trim().max(1000).optional().nullable(),
  lastUserMessage: z.string().trim().max(2000).optional().nullable(),
  lastAiMessage: z.string().trim().max(2000).optional().nullable(),
});

export const escalateAiConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => Input.parse(raw))
  .handler(async ({ data, context }) => {
    // Per-user rate limit — escalations create real operational load.
    const limited = await applyRateLimit(new Request("http://local/escalate"), {
      category: "ai_chat",
      extraKey: `escalate:${context.userId}`,
    });
    if (limited) throw new Error("rate_limited");

    const { data: rows, error } = await context.supabase.rpc(
      "escalate_ai_to_inbox",
      {
        _conversation_id: data.conversationId,
        _reason: data.reason,
        _severity: data.severity,
        _lang: data.lang ?? "ar",
        _summary: data.summary ?? null,
        _last_user_msg: data.lastUserMessage ?? null,
        _last_ai_msg: data.lastAiMessage ?? null,
      } as never,
    );
    if (error) {
      // Preserve semantic error codes to the caller without leaking SQL.
      const msg = error.message || "escalation_failed";
      if (/authorized|authentication/i.test(msg)) throw new Error("forbidden");
      if (/not found/i.test(msg)) throw new Error("conversation_not_found");
      if (/reason too short/i.test(msg)) throw new Error("reason_too_short");
      throw new Error("escalation_failed");
    }
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("escalation_failed");

    return {
      ok: true,
      inboxItemId: (row as any).inbox_item_id as string,
      requestNumber: (row as any).request_number as string,
      incidentId: (row as any).incident_id as string,
    };
  });
