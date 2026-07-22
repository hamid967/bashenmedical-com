/**
 * /admin/realtime-monitor — Live monitor for Realtime events on
 * `appointments` and `slot_holds`. Client-only: subscribes on mount, tracks
 * per-table success/error counters and end-to-end latency (event.commit_timestamp → arrival),
 * and shows a rolling log of the most recent events.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const Route = createFileRoute("/_authenticated/admin/realtime-monitor")({
  component: RealtimeMonitorPage,
});

type EventKind = "INSERT" | "UPDATE" | "DELETE";
type TableName = "appointments" | "slot_holds";
type Status = "idle" | "subscribing" | "subscribed" | "error" | "closed";

interface LogRow {
  id: string;
  ts: number; // arrival time (client clock)
  commitTs: number | null; // event commit time (server clock) if present
  latencyMs: number | null;
  table: TableName;
  kind: EventKind;
  rowId: string | null;
  summary: string;
}

interface Counters {
  ok: number;
  err: number;
  byKind: Record<EventKind, number>;
  latencies: number[]; // rolling window, ms
}

const emptyCounters = (): Counters => ({
  ok: 0,
  err: 0,
  byKind: { INSERT: 0, UPDATE: 0, DELETE: 0 },
  latencies: [],
});

const MAX_LOG = 200;
const MAX_LAT = 500;

function pctl(arr: number[], p: number): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[i];
}

function fmtMs(v: number | null): string {
  if (v === null) return "—";
  if (v < 1000) return `${Math.round(v)} ms`;
  return `${(v / 1000).toFixed(2)} s`;
}

function statusColor(s: Status): string {
  switch (s) {
    case "subscribed":
      return "text-emerald-600 bg-emerald-500/10 border-emerald-500/30";
    case "subscribing":
      return "text-amber-600 bg-amber-500/10 border-amber-500/30";
    case "error":
      return "text-red-600 bg-red-500/10 border-red-500/30";
    case "closed":
      return "text-slate-600 bg-slate-500/10 border-slate-500/30";
    default:
      return "text-slate-600 bg-slate-500/10 border-slate-500/30";
  }
}

function summarize(table: TableName, kind: EventKind, row: Record<string, unknown> | null): string {
  if (!row) return kind;
  if (table === "appointments") {
    const st = String(row.status ?? "");
    const d = String(row.appointment_date ?? "");
    const t = String(row.appointment_time ?? "").slice(0, 5);
    return `${st || "?"} · ${d} ${t}`.trim();
  }
  const exp = row.expires_at ? new Date(String(row.expires_at)).toLocaleTimeString("ar-SA") : "";
  return `hold · exp ${exp}`;
}

function RealtimeMonitorPage() {
  const [status, setStatus] = useState<Record<TableName, Status>>({
    appointments: "idle",
    slot_holds: "idle",
  });
  const [counters, setCounters] = useState<Record<TableName, Counters>>({
    appointments: emptyCounters(),
    slot_holds: emptyCounters(),
  });
  const [log, setLog] = useState<LogRow[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<"all" | TableName>("all");
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const startedAtRef = useRef<number>(Date.now());
  const [tick, setTick] = useState(0);

  // Refresh derived metrics (uptime, rate) every second
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    startedAtRef.current = Date.now();
    const channels: RealtimeChannel[] = [];

    (["appointments", "slot_holds"] as TableName[]).forEach((table) => {
      setStatus((s) => ({ ...s, [table]: "subscribing" }));
      const ch = supabase
        .channel(`admin-monitor:${table}`)
        .on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
          if (pausedRef.current) return;
          const kind = payload.eventType as EventKind;
          const commitStr = (payload as { commit_timestamp?: string }).commit_timestamp ?? null;
          const commitTs = commitStr ? new Date(commitStr).getTime() : null;
          const now = Date.now();
          const latency = commitTs !== null ? Math.max(0, now - commitTs) : null;
          const row = (payload.new ?? payload.old ?? null) as Record<string, unknown> | null;
          const rowId = row && typeof row.id === "string" ? row.id : null;
          const entry: LogRow = {
            id: `${table}-${now}-${Math.random().toString(36).slice(2, 7)}`,
            ts: now,
            commitTs,
            latencyMs: latency,
            table,
            kind,
            rowId,
            summary: summarize(table, kind, row),
          };
          setLog((prev) => [entry, ...prev].slice(0, MAX_LOG));
          setCounters((prev) => {
            const c = { ...prev[table] };
            c.ok += 1;
            c.byKind = { ...c.byKind, [kind]: c.byKind[kind] + 1 };
            if (latency !== null) {
              c.latencies = [...c.latencies, latency].slice(-MAX_LAT);
            }
            return { ...prev, [table]: c };
          });
        })
        .on("system", {}, (payload) => {
          const ev = String((payload as { event?: string }).event ?? "");
          if (ev === "channel_error" || ev === "phx_error" || ev === "postgres_changes_error") {
            setCounters((prev) => ({
              ...prev,
              [table]: { ...prev[table], err: prev[table].err + 1 },
            }));
            setStatus((s) => ({ ...s, [table]: "error" }));
          }
        })
        .subscribe((s) => {
          if (s === "SUBSCRIBED") setStatus((prev) => ({ ...prev, [table]: "subscribed" }));
          else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
            setStatus((prev) => ({ ...prev, [table]: "error" }));
            setCounters((prev) => ({
              ...prev,
              [table]: { ...prev[table], err: prev[table].err + 1 },
            }));
          } else if (s === "CLOSED") setStatus((prev) => ({ ...prev, [table]: "closed" }));
        });
      channels.push(ch);
    });

    return () => {
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, []);

  const uptimeSec = Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000));
  void tick;

  const totals = useMemo(() => {
    const a = counters.appointments;
    const h = counters.slot_holds;
    const all = [...a.latencies, ...h.latencies];
    return {
      ok: a.ok + h.ok,
      err: a.err + h.err,
      rate: ((a.ok + h.ok) / uptimeSec).toFixed(2),
      p50: pctl(all, 50),
      p95: pctl(all, 95),
      p99: pctl(all, 99),
    };
  }, [counters, uptimeSec]);

  const displayLog = filter === "all" ? log : log.filter((r) => r.table === filter);

  const clear = () => {
    setLog([]);
    setCounters({ appointments: emptyCounters(), slot_holds: emptyCounters() });
    startedAtRef.current = Date.now();
  };

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Radio className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">مراقبة Realtime — الحجوزات والـHolds</h1>
            <p className="text-sm text-muted-foreground">
              متابعة مباشرة لأحداث <code>appointments</code> و<code>slot_holds</code> مع عدّادات
              النجاح/الخطأ وزمن التأخر.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {paused ? "استئناف" : "إيقاف مؤقت"}
          </button>
          <button
            onClick={clear}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          >
            <Trash2 className="h-4 w-4" /> تصفير
          </button>
        </div>
      </header>

      {/* KPI cards */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={CheckCircle2} label="أحداث ناجحة" value={String(totals.ok)} tone="ok" />
        <Kpi
          icon={AlertTriangle}
          label="أخطاء"
          value={String(totals.err)}
          tone={totals.err > 0 ? "err" : "muted"}
        />
        <Kpi icon={Activity} label="المعدل / ثانية" value={totals.rate} tone="muted" />
        <Kpi icon={Gauge} label="زمن التأخر p95" value={fmtMs(totals.p95)} tone="muted" />
      </section>

      {/* Per-table breakdown */}
      <section className="grid gap-4 md:grid-cols-2">
        {(["appointments", "slot_holds"] as TableName[]).map((t) => {
          const c = counters[t];
          const p50 = pctl(c.latencies, 50);
          const p95 = pctl(c.latencies, 95);
          const p99 = pctl(c.latencies, 99);
          return (
            <div key={t} className="rounded-lg border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">
                  {t === "appointments" ? "الحجوزات" : "حجز المواعيد المؤقت (holds)"}
                </h2>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${statusColor(status[t])}`}
                >
                  {status[t]}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <Stat label="ناجحة" value={c.ok} />
                <Stat label="أخطاء" value={c.err} tone={c.err > 0 ? "err" : "default"} />
                <Stat label="عيّنات" value={c.latencies.length} />
                <Stat label="INSERT" value={c.byKind.INSERT} />
                <Stat label="UPDATE" value={c.byKind.UPDATE} />
                <Stat label="DELETE" value={c.byKind.DELETE} />
                <Stat label="p50" value={fmtMs(p50)} />
                <Stat label="p95" value={fmtMs(p95)} />
                <Stat label="p99" value={fmtMs(p99)} />
              </div>
            </div>
          );
        })}
      </section>

      {/* Event log */}
      <section className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
          <div className="flex items-center gap-2 text-sm">
            <RefreshCw
              className={`h-4 w-4 ${paused ? "text-muted-foreground" : "text-emerald-600 animate-pulse"}`}
            />
            <span>سجل الأحداث المباشر ({displayLog.length})</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            {(["all", "appointments", "slot_holds"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md border px-2 py-1 ${filter === f ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
              >
                {f === "all" ? "الكل" : f === "appointments" ? "حجوزات" : "holds"}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-xs">
              <tr className="text-right">
                <th className="p-2">الوقت</th>
                <th className="p-2">الجدول</th>
                <th className="p-2">النوع</th>
                <th className="p-2">التأخر</th>
                <th className="p-2">المعرّف</th>
                <th className="p-2">الملخّص</th>
              </tr>
            </thead>
            <tbody>
              {displayLog.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    بانتظار أحداث Realtime…
                  </td>
                </tr>
              ) : (
                displayLog.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-accent/30">
                    <td className="p-2 whitespace-nowrap tabular-nums">
                      {new Date(r.ts).toLocaleTimeString("ar-SA")}
                    </td>
                    <td className="p-2">{r.table === "appointments" ? "حجوزات" : "holds"}</td>
                    <td className="p-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          r.kind === "INSERT"
                            ? "bg-emerald-500/10 text-emerald-700"
                            : r.kind === "UPDATE"
                              ? "bg-sky-500/10 text-sky-700"
                              : "bg-rose-500/10 text-rose-700"
                        }`}
                      >
                        {r.kind}
                      </span>
                    </td>
                    <td className="p-2 tabular-nums">{fmtMs(r.latencyMs)}</td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">
                      {r.rowId ? r.rowId.slice(0, 8) : "—"}
                    </td>
                    <td className="p-2 text-muted-foreground">{r.summary}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone: "ok" | "err" | "muted";
}) {
  const toneClass =
    tone === "ok" ? "text-emerald-600" : tone === "err" ? "text-red-600" : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`h-4 w-4 ${toneClass}`} />
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "err";
}) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-semibold tabular-nums ${tone === "err" ? "text-red-600" : ""}`}>
        {value}
      </div>
    </div>
  );
}
