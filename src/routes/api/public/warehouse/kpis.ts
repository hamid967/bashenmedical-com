/**
 * Public warehouse export — daily KPI rollup as CSV or JSON for external BI
 * tools (Metabase, Tableau, Looker Studio, etc.).
 *
 * Auth: Bearer token via `Authorization: Bearer <secret>` or `?secret=<>`.
 * Set `WAREHOUSE_EXPORT_SECRET` in project secrets. Falls back to
 * `PERF_CRON_SECRET` so ops teams reuse the existing rotated cron secret.
 *
 * Query params:
 *   - format: "csv" (default) | "json"
 *   - days: 1..180 (default 30)
 *   - metric: optional filter
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/warehouse/kpis")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request): Promise<Response> {
  const secret =
    process.env.WAREHOUSE_EXPORT_SECRET ||
    process.env.PERF_CRON_SECRET ||
    process.env.SLA_CRON_SECRET;
  if (!secret) return new Response("not_configured", { status: 500 });

  const url = new URL(request.url);
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const qsSecret = url.searchParams.get("secret") ?? "";
  const provided = bearer || qsSecret;
  if (provided !== secret) return new Response("unauthorized", { status: 401 });

  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const days = Math.min(
    180,
    Math.max(1, Number.parseInt(url.searchParams.get("days") ?? "30", 10) || 30),
  );
  const metric = url.searchParams.get("metric");
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - days);
  const fromDay = from.toISOString().slice(0, 10);

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("bi_daily_kpis")
      .select("day, metric, dimension, value_numeric, sample_size, refreshed_at")
      .gte("day", fromDay)
      .order("day", { ascending: false })
      .limit(20000);
    if (metric) q = q.eq("metric", metric);
    const { data, error } = await q;
    if (error) return new Response(`db_error: ${error.message}`, { status: 500 });

    if (format === "json") {
      return Response.json({ ok: true, from: fromDay, rows: data ?? [] });
    }

    // CSV
    const cols = ["day", "metric", "dimension", "value_numeric", "sample_size", "refreshed_at"];
    const esc = (v: unknown): string => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(",")];
    for (const r of data ?? []) {
      lines.push(cols.map((c) => esc((r as Record<string, unknown>)[c])).join(","));
    }
    return new Response(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bi_daily_kpis_${fromDay}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return new Response(`export_failed: ${e?.message ?? "unknown"}`, { status: 500 });
  }
}
