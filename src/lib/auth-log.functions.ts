import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function getClientMeta() {
  let ip: string | null = null;
  let ua: string | null = null;
  try {
    ua = getRequestHeader("user-agent") ?? null;
    try {
      ip = getRequestIP({ xForwardedFor: true }) ?? null;
    } catch {}
    if (!ip) {
      const fwd = getRequestHeader("x-forwarded-for");
      const real = getRequestHeader("x-real-ip");
      const cf = getRequestHeader("cf-connecting-ip");
      ip = cf ?? real ?? (fwd ? fwd.split(",")[0]?.trim() : null) ?? null;
    }
  } catch {}
  return { ip, ua };
}

const ACTIONS = [
  "login_success",
  "login_failed",
  "logout",
  "signup_success",
  "signup_failed",
] as const;

export const logAuthEvent = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        action: z.enum(ACTIONS),
        user_id: z.string().uuid().nullable().optional(),
        email: z.string().max(320).nullable().optional(),
        metadata: z.record(z.string(), z.any()).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { ip, ua } = getClientMeta();
    const supa = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await supa.rpc(
      "log_auth_event" as any,
      {
        _action: data.action,
        _user_id: data.user_id ?? null,
        _email: data.email ?? null,
        _ip: ip,
        _ua: ua,
        _metadata: (data.metadata ?? null) as any,
      } as any,
    );
    if (error) {
      // Never block auth flow on logging errors
      console.error("logAuthEvent error", error.message);
      return { ok: false };
    }
    return { ok: true };
  });
