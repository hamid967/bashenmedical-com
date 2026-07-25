import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { applyRateLimit } from "@/lib/v3/rate-limit-unified.server";

/**
 * Client error collector — public, low-security endpoint.
 * Accepts browser-side error reports (window.onerror,
 * unhandledrejection, React error boundary) posted via sendBeacon
 * from `src/lib/observability/error-reporter.ts`.
 *
 * Bounded by RLS INSERT WITH CHECK on `public.client_error_events`.
 * No PII expected; length caps + rate limit prevent abuse.
 */
const ErrorSchema = z.object({
  message: z.string().min(1).max(2000),
  route: z.string().min(1).max(512),
  stack: z.string().max(8000).optional(),
  mechanism: z
    .enum(["onerror", "unhandledrejection", "react_error_boundary", "manual"])
    .default("manual"),
  severity: z.enum(["error", "warning", "info"]).default("error"),
  release: z.string().max(64).optional(),
  correlation_id: z.string().max(64).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/hooks/errors")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const limited = await applyRateLimit(request, { category: "reads" });
        if (limited) {
          const h = new Headers(limited.headers);
          for (const [k, v] of Object.entries(CORS_HEADERS)) h.set(k, v);
          return new Response(limited.body, { status: limited.status, headers: h });
        }
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return new Response("bad json", { status: 400, headers: CORS_HEADERS });
        }
        const parsed = ErrorSchema.safeParse(raw);
        if (!parsed.success) {
          return new Response("invalid", { status: 400, headers: CORS_HEADERS });
        }
        const ev = parsed.data;
        const ua = (request.headers.get("user-agent") ?? "").slice(0, 512);

        try {
          const { createClient } = await import("@supabase/supabase-js");
          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!url || !key) {
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

          await supabase.from("client_error_events").insert({
            message: ev.message,
            route: ev.route,
            stack: ev.stack ?? null,
            mechanism: ev.mechanism,
            severity: ev.severity,
            release: ev.release ?? null,
            correlation_id: ev.correlation_id ?? null,
            user_agent: ua,
            extra: ev.extra ?? null,
          });
        } catch {
          // Telemetry never blocks the caller.
        }
        return new Response("ok", { status: 202, headers: CORS_HEADERS });
      },
    },
  },
});
