import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import mcp from "@/lib/mcp/index";
import { ToolContext } from "@lovable.dev/mcp-js";

export type RunToolResult = {
  ok: boolean;
  isError: boolean;
  durationMs: number;
  text: string;
  structuredJson: string | null;
};

/**
 * Manually invoke an MCP tool from the diagnostics page. Uses the same
 * `ToolContext` shape the real MCP handler passes, so tools behave identically
 * (auth, RLS, logging). The caller must be signed in.
 */
export const runMcpTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { toolName: string; args: Record<string, unknown> }) => input)
  .handler(async ({ data, context }): Promise<RunToolResult> => {
    const tool = (
      mcp as unknown as { tools: Array<{ name: string; handler: Function }> }
    ).tools.find((t) => t.name === data.toolName);
    if (!tool) throw new Error(`Unknown tool: ${data.toolName}`);

    const authHeader = getRequestHeader("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const claims = context.claims as Record<string, unknown>;

    // Reconstruct the auth shape ToolContext expects.
    const auth = {
      bearer: { token },
      principal: {
        sub: context.userId,
        email: (claims.email as string | undefined) ?? undefined,
        clientId: (claims.client_id as string | undefined) ?? undefined,
        scopes: Array.isArray(claims.scopes) ? (claims.scopes as string[]) : undefined,
        issuer: (claims.iss as string | undefined) ?? undefined,
        claims,
      },
    };

    const ctx = new ToolContext(auth as never);
    const startedAt = Date.now();
    let result: {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
      structuredContent?: unknown;
    };
    try {
      result = await (tool.handler as (a: unknown, c: ToolContext) => Promise<typeof result>)(
        data.args ?? {},
        ctx,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        isError: true,
        durationMs: Date.now() - startedAt,
        text: msg,
        structuredJson: null,
      };
    }

    const first = result.content?.[0];
    const text =
      typeof first?.text === "string" ? first.text : JSON.stringify(result.content ?? []);
    return {
      ok: !result.isError,
      isError: !!result.isError,
      durationMs: Date.now() - startedAt,
      text,
      structuredJson: result.structuredContent ? JSON.stringify(result.structuredContent) : null,
    };
  });
