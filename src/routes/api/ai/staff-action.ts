/**
 * Staff-scope AI mutation endpoint (Phase 10.b — gradual rollout).
 *
 * Two-phase, deny-by-default:
 *   phase=prepare  → verifies staff role + feature flags + params;
 *                    returns { confirm_token, summary, expires_at }.
 *   phase=execute  → requires the exact confirm_token AND `confirm: true`;
 *                    runs the mutation as the staff caller (RLS enforced).
 *
 * Guards layered here (any single failure aborts):
 *   1. Rate limit (ai_chat category).
 *   2. Auth: bearer token.
 *   3. Feature flags: ai.assistant.staff.enabled AND
 *      ai.assistant.staff.mutations.enabled.
 *   4. Role: at least one staff role via has_role RPC.
 *   5. Registry: tool exists, kind=mutation, allowedScopes includes "staff".
 *   6. Params: strict Zod schema per tool.
 *   7. Execute: HMAC token valid, not expired, matches user + tool + params.
 *   8. Every prepare AND execute call is audited in ai_tool_invocations.
 */

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { applyRateLimit } from "@/lib/v3/rate-limit-unified.server";
import { getFeatureFlag, readAuthUser } from "@/lib/ai/ai.server";
import { detectStaffRoles } from "@/lib/ai/staff-snapshot.server";
import { TOOL_REGISTRY, canInvoke } from "@/lib/ai/tools/registry";
import {
  mintConfirmToken,
  verifyConfirmToken,
  hashParams,
} from "@/lib/ai/tools/staff-confirm.server";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "content-type": "application/json" },
  });

// Per-tool params schema. Adding a new staff mutation requires (1) adding
// it to the registry and (2) registering its schema here — no schema, no run.
const StaffToolSchemas = {
  staff_add_inbox_note: z.object({
    inbox_item_id: z.string().uuid(),
    note: z.string().trim().min(1).max(2000),
  }),
} as const satisfies Record<string, z.ZodTypeAny>;

type StaffToolName = keyof typeof StaffToolSchemas;

const Body = z.object({
  phase: z.enum(["prepare", "execute"]),
  tool: z.string(),
  params: z.record(z.unknown()).default({}),
  confirm_token: z.string().optional(),
  confirm: z.boolean().optional(),
});

async function auditInvocation(
  sb: ReturnType<typeof createClient>,
  row: {
    user_id: string;
    tool: string;
    phase: "prepare" | "execute";
    status: "ok" | "denied" | "error";
    params: unknown;
    denial_reason?: string;
  },
) {
  await sb.from("ai_tool_invocations").insert({
    user_id: row.user_id,
    tool_name: row.tool,
    scope: "staff",
    phase: row.phase,
    status: row.status,
    params: row.params as never,
    denial_reason: row.denial_reason ?? null,
  } as never);
}

export const Route = createFileRoute("/api/ai/staff-action")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rl = await applyRateLimit(request, { category: "ai_chat" });
        if (rl) return rl;

        const auth = await readAuthUser(request);
        if (!auth) return json({ error: "unauthenticated" }, 401);

        let parsedBody: z.infer<typeof Body>;
        try {
          parsedBody = Body.parse(await request.json());
        } catch {
          return json({ error: "bad_request" }, 400);
        }

        // Flags: BOTH must be on.
        const [staffOn, mutOn] = await Promise.all([
          getFeatureFlag("ai.assistant.staff.enabled"),
          getFeatureFlag("ai.assistant.staff.mutations.enabled"),
        ]);
        if (!staffOn || !mutOn) return json({ error: "feature_disabled" }, 503);

        // Role check.
        const roles = await detectStaffRoles(auth.userId, auth.token);
        if (roles.length === 0) return json({ error: "not_staff" }, 403);

        // Registry gate.
        const tool = parsedBody.tool as StaffToolName;
        if (!canInvoke("staff", tool)) return json({ error: "tool_not_allowed" }, 403);
        const schema = StaffToolSchemas[tool];
        if (!schema) return json({ error: "unknown_tool" }, 400);

        const paramsCheck = schema.safeParse(parsedBody.params);
        if (!paramsCheck.success) {
          return json(
            { error: "invalid_params", details: paramsCheck.error.flatten() },
            400,
          );
        }
        const params = paramsCheck.data;

        const sb = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${auth.token}` } },
          },
        );

        // ---------- PREPARE ----------
        if (parsedBody.phase === "prepare") {
          const summary = await buildSummary(sb, tool, params);
          const { token, expiresAt } = mintConfirmToken({
            userId: auth.userId,
            tool,
            params,
          });
          await auditInvocation(sb, {
            user_id: auth.userId,
            tool,
            phase: "prepare",
            status: "ok",
            params,
          });
          return json({
            phase: "prepare",
            tool,
            label: TOOL_REGISTRY[tool].labelAr,
            summary,
            confirm_token: token,
            expires_at: expiresAt,
            requires_confirmation: true,
          });
        }

        // ---------- EXECUTE ----------
        if (!parsedBody.confirm_token || parsedBody.confirm !== true) {
          await auditInvocation(sb, {
            user_id: auth.userId,
            tool,
            phase: "execute",
            status: "denied",
            params,
            denial_reason: "missing_confirmation",
          });
          return json({ error: "confirmation_required" }, 400);
        }
        const v = verifyConfirmToken(parsedBody.confirm_token);
        if (!v.ok) {
          await auditInvocation(sb, {
            user_id: auth.userId,
            tool,
            phase: "execute",
            status: "denied",
            params,
            denial_reason: `token_${v.reason}`,
          });
          return json({ error: `token_${v.reason}` }, 400);
        }
        if (v.userId !== auth.userId || v.tool !== tool || v.paramsHash !== hashParams(params)) {
          await auditInvocation(sb, {
            user_id: auth.userId,
            tool,
            phase: "execute",
            status: "denied",
            params,
            denial_reason: "token_mismatch",
          });
          return json({ error: "token_mismatch" }, 403);
        }

        try {
          const result = await execute(sb, tool, params);
          await auditInvocation(sb, {
            user_id: auth.userId,
            tool,
            phase: "execute",
            status: "ok",
            params,
          });
          return json({ phase: "execute", tool, ok: true, result });
        } catch (err) {
          await auditInvocation(sb, {
            user_id: auth.userId,
            tool,
            phase: "execute",
            status: "error",
            params,
            denial_reason: (err as Error).message?.slice(0, 200) ?? "unknown",
          });
          return json({ error: "execute_failed" }, 500);
        }
      },
    },
  },
});

async function buildSummary(
  sb: ReturnType<typeof createClient>,
  tool: StaffToolName,
  params: Record<string, unknown>,
): Promise<string> {
  if (tool === "staff_add_inbox_note") {
    const id = params.inbox_item_id as string;
    // RLS-scoped read; if the staff cannot see the item they cannot mutate it.
    const { data } = await sb
      .from("inbox_items")
      .select("id, subject, status, channel")
      .eq("id", id)
      .maybeSingle();
    if (!data) throw new Error("inbox_item_not_visible");
    const preview = String(params.note ?? "").slice(0, 200);
    return `سيتم إضافة ملاحظة داخلية على الطلب "${(data as { subject?: string }).subject ?? id}" (الحالة: ${(data as { status?: string }).status ?? "؟"}). الملاحظة: «${preview}». لن يُرسل شيء للمريض.`;
  }
  return "إجراء غير موصوف.";
}

async function execute(
  sb: ReturnType<typeof createClient>,
  tool: StaffToolName,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (tool === "staff_add_inbox_note") {
    const { error } = await sb.rpc("inbox_log_event", {
      _item_id: params.inbox_item_id as string,
      _action: "add_note",
      _from: null,
      _to: null,
      _note: params.note as string,
    });
    if (error) throw new Error(error.message);
    return { inbox_item_id: params.inbox_item_id };
  }
  throw new Error("unhandled_tool");
}
