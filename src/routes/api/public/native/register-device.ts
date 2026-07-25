/**
 * POST /api/public/native/register-device
 *
 * Called by the Capacitor shell on app launch (and every time the OS
 * rotates the push token). Verifies the caller's Supabase session from the
 * `Authorization: Bearer <access_token>` header, then upserts a native
 * subscription row into `push_subscriptions`.
 *
 * This runs under `/api/public/*` so it bypasses the published-site auth
 * middleware, but the handler enforces auth itself before touching the DB.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  platform: z.enum(["ios", "android"]),
  token: z.string().min(10).max(4096),
  appVersion: z.string().max(64).nullable().optional(),
  deviceModel: z.string().max(200).nullable().optional(),
});

async function json(body: unknown, status = 200): Promise<Response> {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/native/register-device")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("Authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (!token) return json({ error: "missing bearer token" }, 401);

        let payload: z.infer<typeof Body>;
        try {
          payload = Body.parse(await request.json());
        } catch (e) {
          return json({ error: "invalid body", detail: (e as Error).message }, 400);
        }

        // Load admin client inside the handler (never at module scope of a
        // route file — the file is client-reachable via SSR entry).
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: userResp, error: userErr } = await supabaseAdmin.auth.getUser(token);
        if (userErr || !userResp.user) return json({ error: "invalid session" }, 401);
        const userId = userResp.user.id;

        // Upsert by (user_id, platform, native_token) — the unique index we
        // added in the F2 migration. Refresh last_seen_at so token GC works.
        const { error: upErr } = await supabaseAdmin.from("push_subscriptions").upsert(
          {
            user_id: userId,
            platform: payload.platform,
            native_token: payload.token,
            app_version: payload.appVersion ?? null,
            device_model: payload.deviceModel ?? null,
            last_seen_at: new Date().toISOString(),
            failure_count: 0,
          },
          { onConflict: "user_id,platform,native_token", ignoreDuplicates: false },
        );
        if (upErr) return json({ error: "db upsert failed", detail: upErr.message }, 500);

        return json({ ok: true });
      },
    },
  },
});
