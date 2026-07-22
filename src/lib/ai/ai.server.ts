/**
 * Server-only helpers for the Baeshen AI Assistant.
 * NEVER import this from client code.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface ModelRoute {
  route_name: string;
  model_id: string;
  fallback_id: string | null;
  enabled: boolean;
}

const DEFAULT_FAST = "google/gemini-3.5-flash";
const DEFAULT_DEEP = "openai/gpt-5.4";

export function serverClient(bearer?: string): SupabaseClient {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: bearer
      ? { headers: { Authorization: `Bearer ${bearer}` } }
      : undefined,
  });
}

export async function readAuthUser(request: Request): Promise<{ userId: string; token: string } | null> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const sb = serverClient(token);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id, token };
}

export async function getFeatureFlag(key: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin.from("ai_feature_flags").select("enabled").eq("key", key).maybeSingle();
    return !!data?.enabled;
  } catch { return false; }
}

export async function getModel(route: "fast" | "deep"): Promise<string> {
  try {
    const { data } = await supabaseAdmin.from("ai_model_routes").select("model_id, fallback_id, enabled").eq("route_name", route).maybeSingle();
    if (data?.enabled && data.model_id) return data.model_id;
    if (data?.fallback_id) return data.fallback_id;
  } catch { /* fall through */ }
  return route === "deep" ? DEFAULT_DEEP : DEFAULT_FAST;
}

export async function recordSafetyIncident(params: {
  conversationId?: string | null;
  actor?: string | null;
  kind: string;
  severity?: "info" | "warn" | "high" | "critical";
  action?: string;
  details?: Record<string, unknown>;
}) {
  try {
    const sb = serverClient();
    await sb.from("ai_safety_incidents").insert({
      conversation_id: params.conversationId ?? null,
      actor: params.actor ?? null,
      kind: params.kind,
      severity: params.severity ?? "warn",
      action_taken: params.action ?? null,
      details: params.details ?? {},
    });
  } catch { /* best-effort */ }
}
