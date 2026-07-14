/**
 * Active session management for the currently signed-in user.
 *
 * Backed by the Supabase GoTrue Admin API (via the service role client, loaded
 * lazily inside each handler to keep it out of the client bundle):
 *   - GET    /auth/v1/admin/users/{user_id}/sessions
 *   - DELETE /auth/v1/admin/sessions/{session_id}
 *
 * Global sign-out ("all devices") and "others only" sign-out are performed
 * client-side via `supabase.auth.signOut({ scope })` — no server function
 * needed, and it keeps the current browser session clean.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ActiveSession = {
  id: string;
  created_at: string | null;
  updated_at: string | null;
  user_agent: string | null;
  ip: string | null;
  is_current: boolean;
};

type GoTrueSession = {
  id: string;
  user_id: string;
  created_at?: string | null;
  updated_at?: string | null;
  factor_id?: string | null;
  aal?: string | null;
  not_after?: string | null;
  user_agent?: string | null;
  ip?: string | null;
};

function requireEnv() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase server credentials");
  }
  return { url, serviceKey };
}

async function adminFetch(path: string, init?: RequestInit) {
  const { url, serviceKey } = requireEnv();
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

/* ------------------------------ listMySessions --------------------------- */

export const listMySessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ActiveSession[]> => {
    const { userId, claims } = context;
    const currentSessionId =
      (claims as { session_id?: string } | null | undefined)?.session_id ?? null;

    const res = await adminFetch(`/auth/v1/admin/users/${userId}/sessions`);
    if (!res.ok) {
      // Some GoTrue versions expose the list under the user object instead.
      if (res.status === 404) {
        const alt = await adminFetch(`/auth/v1/admin/users/${userId}`);
        if (alt.ok) {
          const body = (await alt.json()) as { sessions?: GoTrueSession[] };
          const sessions = body.sessions ?? [];
          return sessions.map((s) => normalize(s, currentSessionId));
        }
      }
      throw new Error(`Failed to list sessions (${res.status})`);
    }

    const body = (await res.json()) as { sessions?: GoTrueSession[] } | GoTrueSession[];
    const list = Array.isArray(body) ? body : (body.sessions ?? []);
    return list.map((s) => normalize(s, currentSessionId));
  });

function normalize(s: GoTrueSession, currentSessionId: string | null): ActiveSession {
  return {
    id: s.id,
    created_at: s.created_at ?? null,
    updated_at: s.updated_at ?? null,
    user_agent: s.user_agent ?? null,
    ip: s.ip ?? null,
    is_current: currentSessionId != null && s.id === currentSessionId,
  };
}

/* ----------------------------- revokeMySession --------------------------- */

const RevokeSchema = z.object({ sessionId: z.string().uuid() });

export const revokeMySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => RevokeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Verify the target session belongs to the caller before deleting it.
    const listRes = await adminFetch(`/auth/v1/admin/users/${userId}/sessions`);
    let ownsSession = false;
    if (listRes.ok) {
      const body = (await listRes.json()) as { sessions?: GoTrueSession[] } | GoTrueSession[];
      const list = Array.isArray(body) ? body : (body.sessions ?? []);
      ownsSession = list.some((s) => s.id === data.sessionId);
    } else if (listRes.status === 404) {
      const alt = await adminFetch(`/auth/v1/admin/users/${userId}`);
      if (alt.ok) {
        const body = (await alt.json()) as { sessions?: GoTrueSession[] };
        ownsSession = (body.sessions ?? []).some((s) => s.id === data.sessionId);
      }
    }
    if (!ownsSession) {
      throw new Error("Session not found");
    }

    const del = await adminFetch(`/auth/v1/admin/sessions/${data.sessionId}`, {
      method: "DELETE",
    });
    if (!del.ok && del.status !== 204) {
      throw new Error(`Failed to revoke session (${del.status})`);
    }
    return { ok: true as const };
  });
