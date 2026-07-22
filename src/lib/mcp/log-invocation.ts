import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";

const MAX_ARGS_KEYS = 12;
const MAX_STRING_LEN = 120;
const MAX_RESULT_LEN = 500;

function summarizeArgs(args: unknown): Record<string, unknown> | null {
  if (!args || typeof args !== "object") return null;
  const out: Record<string, unknown> = {};
  let i = 0;
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (i++ >= MAX_ARGS_KEYS) break;
    if (v == null) {
      out[k] = v;
    } else if (typeof v === "string") {
      out[k] = v.length > MAX_STRING_LEN ? `${v.slice(0, MAX_STRING_LEN)}…` : v;
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else {
      // Redact nested objects/arrays down to a compact tag.
      out[k] = Array.isArray(v) ? `[array:${v.length}]` : "[object]";
    }
  }
  return out;
}

function summarizeResult(result: {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
}): string {
  const first = result.content?.[0];
  const text = typeof first?.text === "string" ? first.text : "";
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > MAX_RESULT_LEN ? `${trimmed.slice(0, MAX_RESULT_LEN)}…` : trimmed;
}

/**
 * Best-effort logging of an MCP tool call for the signed-in user.
 * Anonymous calls (e.g. `list_branches` without a session) are skipped —
 * there's no user to attribute them to and RLS wouldn't let us insert.
 * All errors are swallowed: logging must never break the tool response.
 */
export async function logMcpInvocation(params: {
  ctx: ToolContext;
  toolName: string;
  args: unknown;
  result: { isError?: boolean; content?: Array<{ type: string; text?: string }> };
  startedAt: number;
}): Promise<void> {
  const { ctx, toolName, args, result, startedAt } = params;
  if (!ctx.isAuthenticated()) return;
  const userId = ctx.getUserId();
  if (!userId) return;

  try {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );

    await (
      supabase as unknown as {
        from: (t: string) => { insert: (row: Record<string, unknown>) => Promise<unknown> };
      }
    )
      .from("mcp_tool_invocations")
      .insert({
        user_id: userId,
        tool_name: toolName,
        is_error: !!result.isError,
        duration_ms: Math.max(0, Date.now() - startedAt),
        args_summary: summarizeArgs(args),
        result_summary: summarizeResult(result),
      });
  } catch {
    // best-effort — never fail the tool because logging failed
  }
}
