/**
 * Performance Budgets sweep — server-only.
 *
 * Computes p75 for each enabled budget (path × metric) over its window
 * against `public.web_vitals`. When p75 exceeds the threshold and enough
 * samples exist, records a de-duped alert (unique on path/metric/bucket_at
 * = date_trunc('hour', now())) and fires a webhook. Webhook target and
 * email recipients are shared with the SLA alert config
 * (`public.sla_alert_config`) so admins configure one destination.
 *
 * Called by:
 *   - `runPerfBudgetSweep` server function (manual "Run now" button)
 *   - `/api/public/cron/perf-budgets` (scheduled; shared secret auth)
 */
export type PerfSweepResult = {
  scanned: number;
  breaches: number;
  new_alerts: number;
  webhook_sent: number;
  errors: string[];
};

const appUrl = (): string =>
  process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://bashenmedical-com.lovable.app";

function pct(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function pathnameOf(u: string): string {
  try {
    return new URL(u).pathname || "/";
  } catch {
    return u || "/";
  }
}

export async function runPerfBudgetSweep(): Promise<PerfSweepResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result: PerfSweepResult = {
    scanned: 0,
    breaches: 0,
    new_alerts: 0,
    webhook_sent: 0,
    errors: [],
  };

  const { data: budgets, error: bErr } = await supabaseAdmin
    .from("perf_budgets")
    .select("id, path, metric, threshold, window_hours, min_samples, enabled")
    .eq("enabled", true);
  if (bErr) {
    result.errors.push(`budgets: ${bErr.message}`);
    return result;
  }
  const list = (budgets ?? []) as Array<{
    path: string;
    metric: string;
    threshold: number;
    window_hours: number;
    min_samples: number;
  }>;
  result.scanned = list.length;
  if (!list.length) return result;

  const { data: cfg } = await supabaseAdmin
    .from("sla_alert_config")
    .select("enabled, webhook_url, email_recipients")
    .eq("id", true)
    .maybeSingle();
  const notify = (cfg ?? { enabled: false, webhook_url: null, email_recipients: [] }) as {
    enabled: boolean;
    webhook_url: string | null;
    email_recipients: string[];
  };

  for (const b of list) {
    try {
      const since = new Date(Date.now() - b.window_hours * 3600_000).toISOString();
      const safePath = escapeIlike(b.path);
      const { data: rows, error } = await supabaseAdmin
        .from("web_vitals")
        .select("value, url")
        .eq("metric", b.metric)
        .gte("ts", since)
        .ilike("url", `%${safePath}%`)
        .limit(5000);
      if (error) {
        result.errors.push(`${b.path}/${b.metric}: ${error.message}`);
        continue;
      }
      // Restrict to exact pathname matches (defence against ILIKE substrings).
      const values = (rows ?? [])
        .filter((r: any) => pathnameOf(r.url ?? "") === b.path)
        .map((r: any) => Number(r.value))
        .filter((v) => Number.isFinite(v))
        .sort((a, b) => a - b);
      if (values.length < b.min_samples) continue;
      const p75 = pct(values, 75);
      if (p75 === null || p75 <= b.threshold) continue;

      result.breaches++;

      // Dedup insert — the unique (path, metric, bucket_at=hour) constraint
      // ensures at most one alert per hour per (path,metric).
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("perf_budget_alerts")
        .insert({
          path: b.path,
          metric: b.metric,
          threshold: b.threshold,
          p75_value: p75,
          sample_size: values.length,
          window_hours: b.window_hours,
        })
        .select("id")
        .maybeSingle();
      if (insErr) {
        // 23505 = unique_violation → already alerted this hour, skip silently.
        if (!/duplicate key|unique/i.test(insErr.message)) {
          result.errors.push(`insert ${b.path}/${b.metric}: ${insErr.message}`);
        }
        continue;
      }
      if (!inserted) continue;
      result.new_alerts++;

      if (!notify.enabled || !notify.webhook_url) continue;
      const payload = {
        event: "perf.budget.breach",
        path: b.path,
        metric: b.metric,
        threshold: b.threshold,
        p75_value: p75,
        sample_size: values.length,
        window_hours: b.window_hours,
        admin_link: `${appUrl()}/admin/web-vitals`,
        at: new Date().toISOString(),
      };
      let webhook_status: number | null = null;
      try {
        const res = await fetch(notify.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8000),
        });
        webhook_status = res.status;
        if (res.ok) result.webhook_sent++;
        else result.errors.push(`webhook ${res.status} for ${b.path}/${b.metric}`);
      } catch (e: any) {
        result.errors.push(`webhook error ${b.path}/${b.metric}: ${e?.message ?? "unknown"}`);
      }
      await supabaseAdmin
        .from("perf_budget_alerts")
        .update({
          webhook_status,
          email_status: notify.email_recipients?.length ? "queued" : null,
        })
        .eq("id", inserted.id);
    } catch (e: any) {
      result.errors.push(`${b.path}/${b.metric}: ${e?.message ?? "unknown"}`);
    }
  }
  return result;
}
