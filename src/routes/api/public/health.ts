/**
 * DR / uptime health endpoint.
 *
 * Contract (frozen — DR drill and external monitors depend on this):
 *   - GET returns 200 with `{ ok: true, ... }` when the Worker is serving.
 *   - Fast (<200ms typical): no DB, no auth, no external calls.
 *   - Cache-Control: no-store so probes always hit origin.
 *   - Public: lives under /api/public/* so no auth middleware is invoked.
 *
 * Used by:
 *   - scripts/dr/run-drill.mjs (DR drill probe)
 *   - .github/workflows/dr-drill.yml
 *   - external uptime monitors
 */
import { createFileRoute } from "@tanstack/react-router";

const STARTED_AT = Date.now();

function payload() {
  return {
    ok: true,
    service: "baeshen-medical",
    region: process.env.LOVABLE_REGION ?? "production",
    uptime_ms: Date.now() - STARTED_AT,
    timestamp: new Date().toISOString(),
  };
}

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(payload()), { status: 200, headers }),
      HEAD: async () => new Response(null, { status: 200, headers }),
    },
  },
});
