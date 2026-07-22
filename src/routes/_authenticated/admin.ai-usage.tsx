/**
 * /admin/ai-usage — admin view of per-user AI usage history.
 * Filterable by window / surface / user; shows top users by credits
 * plus a detailed per-message table.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAllAiUsage, type AdminUsageResponse } from "@/lib/ai/usage.functions";
import { formatCredits, formatTokens } from "@/lib/ai/pricing";
import { Loader2, Activity, Coins, Cpu, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/ai-usage")({
  head: () => ({
    meta: [
      { title: "AI Usage · Admin — Baeshen" },
      { name: "description", content: "Per-user AI cost, tokens and latency history." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminUsagePage,
});

const WINDOWS = [
  { days: 1, label: "24h" },
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
];
const SURFACES = ["all", "public", "portal", "admin"] as const;

function AdminUsagePage() {
  const fetchUsage = useServerFn(listAllAiUsage);
  const [days, setDays] = useState(7);
  const [surface, setSurface] = useState<(typeof SURFACES)[number]>("all");
  const [userId, setUserId] = useState("");
  const [data, setData] = useState<AdminUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchUsage({
      data: {
        windowDays: days,
        surface,
        limit: 300,
        userId: userId.trim() ? userId.trim() : undefined,
      },
    })
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, surface, userId, fetchUsage]);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [],
  );

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5" /> AI Usage History
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cost, tokens, latency and model per message across every user.
        </p>
      </header>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Window</div>
          <div className="flex gap-1">
            {WINDOWS.map((w) => (
              <button
                key={w.days}
                onClick={() => setDays(w.days)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs border",
                  days === w.days
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted border-border",
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Surface</div>
          <div className="flex gap-1">
            {SURFACES.map((s) => (
              <button
                key={s}
                onClick={() => setSurface(s)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs border",
                  surface === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted border-border",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-w-[240px]">
          <div className="text-xs text-muted-foreground mb-1">Filter by user ID (UUID)</div>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-mono"
          />
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={Activity} label="Messages" value={String(data.summary.totalMessages)} />
            <Kpi
              icon={Cpu}
              label="Tokens"
              value={formatTokens(data.summary.totalTokens)}
              sub={`in ${formatTokens(data.summary.totalPromptTokens)} · out ${formatTokens(data.summary.totalCompletionTokens)}`}
            />
            <Kpi icon={Coins} label="Credits" value={formatCredits(data.summary.totalCredits)} />
            <Kpi
              icon={Clock}
              label="Avg latency"
              value={data.summary.avgLatencyMs != null ? `${data.summary.avgLatencyMs} ms` : "—"}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Cpu className="h-4 w-4" /> By model
              </h3>
              <div className="space-y-1 text-sm">
                {data.summary.byModel.map((m) => (
                  <div
                    key={m.model}
                    className="flex items-center justify-between gap-3 border-b border-border/40 last:border-0 py-1.5"
                  >
                    <span className="font-mono text-xs">{m.model}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {m.count} · {formatTokens(m.tokens)} · {formatCredits(m.credits)}
                    </span>
                  </div>
                ))}
                {data.summary.byModel.length === 0 && (
                  <div className="text-xs text-muted-foreground">No data.</div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" /> Top users (by credits)
              </h3>
              <div className="space-y-1 text-sm">
                {data.byUser.map((u) => (
                  <div
                    key={u.user_id}
                    className="flex items-center justify-between gap-3 border-b border-border/40 last:border-0 py-1.5"
                  >
                    <button
                      onClick={() => setUserId(u.user_id)}
                      className="font-mono text-xs truncate hover:underline"
                      title="Filter by this user"
                    >
                      {u.user_id.slice(0, 8)}…{u.user_id.slice(-4)}
                    </button>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {u.count} · {formatTokens(u.tokens)} · {formatCredits(u.credits)}
                    </span>
                  </div>
                ))}
                {data.byUser.length === 0 && (
                  <div className="text-xs text-muted-foreground">No data.</div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 overflow-x-auto">
            <h3 className="text-sm font-semibold mb-3">Recent messages</h3>
            <table className="w-full text-sm min-w-[880px]">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="py-2 text-start">Date</th>
                  <th className="py-2 text-start">User</th>
                  <th className="py-2 text-start">Surface</th>
                  <th className="py-2 text-start">Model</th>
                  <th className="py-2 text-end">In</th>
                  <th className="py-2 text-end">Out</th>
                  <th className="py-2 text-end">Latency</th>
                  <th className="py-2 text-end">Credits</th>
                  <th className="py-2 text-start">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/30 last:border-0">
                    <td className="py-2 whitespace-nowrap text-xs">
                      {dateFmt.format(new Date(r.created_at))}
                    </td>
                    <td className="py-2">
                      {r.user_id ? (
                        <button
                          onClick={() => setUserId(r.user_id!)}
                          className="font-mono text-[11px] hover:underline"
                        >
                          {r.user_id.slice(0, 8)}…
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-xs">anon</span>
                      )}
                    </td>
                    <td className="py-2 text-xs">{r.surface}</td>
                    <td className="py-2 font-mono text-xs">{r.model ?? "—"}</td>
                    <td className="py-2 text-end tabular-nums">{formatTokens(r.prompt_tokens)}</td>
                    <td className="py-2 text-end tabular-nums">
                      {formatTokens(r.completion_tokens)}
                    </td>
                    <td className="py-2 text-end tabular-nums text-xs">
                      {r.latency_ms ? `${r.latency_ms}ms` : "—"}
                    </td>
                    <td className="py-2 text-end tabular-nums">{formatCredits(r.credits)}</td>
                    <td className="py-2 text-xs">
                      {r.error_type
                        ? "error"
                        : r.aborted
                          ? "aborted"
                          : r.completed
                            ? "done"
                            : "partial"}
                    </td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-muted-foreground text-sm">
                      No messages match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {data.hasMore && (
              <p className="mt-3 text-xs text-muted-foreground">
                Showing the latest 300 rows. Narrow the window, surface, or filter by user for more
                detail.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
