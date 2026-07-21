/**
 * POST /api/public/ai/stream-metrics
 *
 * Client beacon endpoint for AI streaming telemetry. Records per-request
 * latency, delta count, resume attempts, and error info. NO PII in payload.
 * Rate-limited per IP and total insert size clamped defensively.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit.server";

const Body = z.object({
  surface: z.enum(["public", "portal", "admin"]),
  model: z.string().max(120).nullable().optional(),
  latency_ms: z.number().int().nonnegative().max(600_000),
  ttfb_ms: z.number().int().nonnegative().max(600_000).nullable().optional(),
  delta_count: z.number().int().nonnegative().max(100_000),
  resume_attempts: z.number().int().nonnegative().max(20),
  completed: z.boolean(),
  aborted: z.boolean().optional().default(false),
  error_status: z.number().int().min(0).max(999).nullable().optional(),
  error_type: z.string().max(80).nullable().optional(),
  prompt_tokens: z.number().int().nonnegative().max(2_000_000).nullable().optional(),
  completion_tokens: z.number().int().nonnegative().max(2_000_000).nullable().optional(),
});

export const Route = createFileRoute("/api/public/ai/stream-metrics")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
        const rl = checkRateLimit(`ai-stream-metrics:${ip}`, [
          { windowMs: 60_000, max: 120 },
          { windowMs: 10_000, max: 30 },
        ]);
        if (!rl.ok) {
          return new Response("Too Many Requests", {
            status: 429,
            headers: { "Retry-After": String(rl.retryAfter) },
          });
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return new Response("Invalid payload", { status: 400 });
        }
        const ev = parsed.data;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("ai_stream_events").insert({
            surface: ev.surface,
            model: ev.model ?? null,
            latency_ms: ev.latency_ms,
            ttfb_ms: ev.ttfb_ms ?? null,
            delta_count: ev.delta_count,
            resume_attempts: ev.resume_attempts,
            completed: ev.completed,
            aborted: ev.aborted ?? false,
            error_status: ev.error_status ?? null,
            error_type: ev.error_type ?? null,
            prompt_tokens: ev.prompt_tokens ?? null,
            completion_tokens: ev.completion_tokens ?? null,
          });
        } catch {
          // Best-effort — never block the client.
          return new Response("", { status: 204 });
        }
        return new Response("", { status: 204 });
      },
    },
  },
});
