/**
 * Alert dispatch for DR drills.
 *
 * Fires when the drill completes with a budget breach or aborts unexpectedly.
 * Uses a webhook (Slack-compatible payload) when `DR_ALERT_WEBHOOK_URL` is
 * set; otherwise logs the alert to stderr so CI still surfaces it.
 *
 * All calls are fail-open at the transport layer — a failed alert MUST NOT
 * mark a passed drill as failed. The drill's own outcome is authoritative.
 */
import type { DrillReport } from "./report";

export interface AlertDispatchResult {
  attempted: boolean;
  delivered: boolean;
  channel: "webhook" | "stderr";
  error?: string;
}

export async function dispatchDrillAlert(
  report: DrillReport,
  opts: {
    webhookUrl?: string | null;
    fetchImpl?: typeof fetch;
    now?: () => number;
  } = {},
): Promise<AlertDispatchResult> {
  const shouldAlert = report.status !== "passed";
  if (!shouldAlert) return { attempted: false, delivered: false, channel: "stderr" };

  const text = buildAlertText(report);
  const url = opts.webhookUrl ?? process.env.DR_ALERT_WEBHOOK_URL ?? null;
  if (!url) {
    // eslint-disable-next-line no-console
    console.error(`[dr-alert] ${text}`);
    return { attempted: true, delivered: true, channel: "stderr" };
  }
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, drill: report }),
    });
    if (!res.ok) {
      return {
        attempted: true,
        delivered: false,
        channel: "webhook",
        error: `webhook_${res.status}`,
      };
    }
    return { attempted: true, delivered: true, channel: "webhook" };
  } catch (e) {
    return {
      attempted: true,
      delivered: false,
      channel: "webhook",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function buildAlertText(r: DrillReport): string {
  const breachLine = r.budgets_breached.length
    ? r.budgets_breached.map((b) => `${b.kind}=${b.actual}>${b.budget}`).join(", ")
    : "no-breaches";
  return `DR drill ${r.drill_id} ${r.status.toUpperCase()} — RPO=${r.measurements.rpo_seconds}s RTO=${r.measurements.rto_seconds}s (${breachLine})`;
}
