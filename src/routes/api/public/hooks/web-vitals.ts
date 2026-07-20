import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Web-vitals collector — public, low-security endpoint.
 * Accepts anonymized page performance samples posted via sendBeacon from
 * the client (`src/lib/observability/web-vitals.ts`).
 *
 * Bounded by RLS INSERT WITH CHECK on `public.web_vitals`.
 * No PII stored; only path, browser UA, metric name and value.
 */

const MetricSchema = z.object({
  name: z.enum(["LCP", "CLS", "INP", "FCP", "TTFB"]),
  value: z.number().finite().min(0).max(600_000),
  id: z.string().max(128).optional(),
  url: z.string().max(512),
  ts: z.number().int().optional(),
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/hooks/web-vitals")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return new Response("bad json", { status: 400, headers: CORS_HEADERS });
        }
        const parsed = MetricSchema.safeParse(raw);
        if (!parsed.success) {
          return new Response("invalid", { status: 400, headers: CORS_HEADERS });
        }
        const m = parsed.data;
        const ua = (request.headers.get("user-agent") ?? "").slice(0, 512);

        try {
          const { createClient } = await import("@supabase/supabase-js");
          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!url || !key) {
            // Config missing — accept silently so client keeps working.
            return new Response("ok", { status: 202, headers: CORS_HEADERS });
          }
          const supabase = createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: {
              fetch: (input, init) => {
                const h = new Headers(init?.headers);
                if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
                  h.delete("Authorization");
                }
                h.set("apikey", key);
                return fetch(input, { ...init, headers: h });
              },
            },
          });

          await supabase.from("web_vitals").insert({
            metric: m.name,
            value: m.value,
            url: m.url,
            metric_id: m.id ?? null,
            user_agent: ua,
          });
        } catch {
          // Never let telemetry failures affect the caller.
        }
        return new Response("ok", { status: 202, headers: CORS_HEADERS });
      },
    },
  },
});
