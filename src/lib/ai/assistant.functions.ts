import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";

export interface AssistantStatus {
  enabled: boolean;
  voiceEnabled: boolean;
  mutationsEnabled: boolean;
  models: { fast: string; deep: string };
}

/** Public status for the floating assistant (safe for anonymous). */
export const getAssistantStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<AssistantStatus> => {
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const [flags, routes] = await Promise.all([
      sb.from("ai_feature_flags").select("key, enabled"),
      sb.from("ai_model_routes").select("route_name, model_id, enabled"),
    ]);
    const flagMap = new Map((flags.data ?? []).map((f) => [f.key, f.enabled]));
    const routeMap = new Map((routes.data ?? []).map((r) => [r.route_name, r]));
    return {
      enabled: !!flagMap.get("ai.assistant.enabled"),
      voiceEnabled: !!flagMap.get("ai.assistant.voice.enabled"),
      mutationsEnabled: !!flagMap.get("ai.assistant.mutations.enabled"),
      models: {
        fast: routeMap.get("fast")?.model_id ?? "google/gemini-3.5-flash",
        deep: routeMap.get("deep")?.model_id ?? "openai/gpt-5.4",
      },
    };
  },
);

/** Signed-in user's recent conversations for the sidebar drawer. */
export const listMyAiConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_conversations")
      .select("id, title, lang, started_at, last_activity_at")
      .order("last_activity_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteMyAiConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => {
    const o = i as { id?: string };
    if (!o?.id || typeof o.id !== "string") throw new Error("id required");
    return { id: o.id };
  })
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("ai_conversations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Fetch messages of a conversation the caller owns (RLS-enforced). */
export const listMyAiMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => {
    const o = i as { conversationId?: string };
    if (!o?.conversationId || typeof o.conversationId !== "string") {
      throw new Error("conversationId required");
    }
    return { conversationId: o.conversationId };
  })
  .handler(async ({ context, data }) => {
    // Verify ownership implicitly via RLS on the parent row
    const { data: conv, error: convErr } = await context.supabase
      .from("ai_conversations")
      .select("id, title, lang, scope, started_at, last_activity_at")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conv) throw new Error("not_found");

    const { data: msgs, error: msgErr } = await context.supabase
      .from("ai_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (msgErr) throw new Error(msgErr.message);
    return { conversation: conv, messages: msgs ?? [] };
  });

/** Bulk delete all of the caller's AI conversations (and messages via cascade). */
export const clearMyAiConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("ai_conversations")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
