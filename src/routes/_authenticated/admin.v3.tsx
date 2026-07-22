/**
 * /admin/v3 — V3 rollout command center.
 * Read-only board over V3 feature flags: toggle each rollout on/off,
 * see progress per pillar and per phase.
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Rocket,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  LayoutDashboard,
  User,
  AlertTriangle,
  Undo2,
  Activity,
} from "lucide-react";
import {
  getV3Rollout,
  setV3Flag,
  PILLAR_LABEL,
  type V3Pillar,
  type V3FlagState,
  type V3RolloutSummary,
} from "@/lib/v3/flags.functions";
import {
  getV3RollbackHealth,
  rollbackV3Flag,
  type FlagHealth,
  type Severity,
} from "@/lib/v3/rollback.functions";

const rolloutQuery = queryOptions({
  queryKey: ["admin", "v3-rollout"],
  queryFn: () => getV3Rollout(),
  staleTime: 20_000,
});

const healthQuery = queryOptions({
  queryKey: ["admin", "v3-rollback-health"],
  queryFn: () => getV3RollbackHealth(),
  staleTime: 30_000,
  refetchInterval: 60_000,
});

export const Route = createFileRoute("/_authenticated/admin/v3")({
  head: () => ({
    meta: [
      { title: "V3 Rollout | لوحة الإدارة" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(rolloutQuery),
  component: V3RolloutPage,
});

const PILLAR_ICON: Record<V3Pillar, React.ComponentType<{ className?: string }>> = {
  reservations: Rocket,
  portal: User,
  admin: LayoutDashboard,
  platform: ShieldCheck,
};

const PILLAR_TONE: Record<V3Pillar, string> = {
  reservations: "from-sky-500 to-indigo-500",
  portal: "from-emerald-500 to-teal-500",
  admin: "from-fuchsia-500 to-purple-500",
  platform: "from-amber-500 to-orange-500",
};

function V3RolloutPage() {
  const qc = useQueryClient();
  const { data, isFetching } = useSuspenseQuery(rolloutQuery);
  const { data: health } = useQuery(healthQuery);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(f: V3FlagState) {
    setBusy(f.key);
    try {
      await setV3Flag({ data: { key: f.key, enabled: !f.enabled } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "v3-rollout"] }),
        qc.invalidateQueries({ queryKey: ["admin", "v3-rollback-health"] }),
      ]);
    } finally {
      setBusy(null);
    }
  }

  async function doRollback(key: string, reason: string) {
    if (!window.confirm(`تراجع فوري عن هذه الميزة؟\n${reason}`)) return;
    setBusy(key);
    try {
      await rollbackV3Flag({ data: { key, reason } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "v3-rollout"] }),
        qc.invalidateQueries({ queryKey: ["admin", "v3-rollback-health"] }),
      ]);
    } finally {
      setBusy(null);
    }
  }

  const overallPct = Math.round((data.totalEnabled / Math.max(1, data.total)) * 100);


  return (
    <div className="admin-console" dir="rtl">
      <div className="p-4 md:p-6 space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl grid place-items-center bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold">ترقية النظام V3</h1>
              <p className="text-xs text-[color:var(--ac-ink-3)]">
                خارطة الطريق للـ 4 محاور — تفعيل تدريجي عبر Feature Flags
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-[color:var(--ac-ink-3)]">
              التقدّم: {data.totalEnabled}/{data.total} ({overallPct}%)
            </div>
            <button
              type="button"
              onClick={() => qc.invalidateQueries({ queryKey: ["admin", "v3-rollout"] })}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ac-line)] px-3 h-9 text-sm hover:bg-[color:var(--ac-subtle)]"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              تحديث
            </button>
          </div>
        </header>

        <ProgressBar pct={overallPct} />

        <PhaseRow data={data} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(Object.keys(PILLAR_LABEL) as V3Pillar[]).map((p) => (
            <PillarCard
              key={p}
              pillar={p}
              flags={data.flags.filter((f) => f.pillar === p)}
              summary={data.countsByPillar[p]}
              busy={busy}
              onToggle={toggle}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-emerald-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function PhaseRow({ data }: { data: V3RolloutSummary }) {
  const phases = [1, 2, 3, 4] as const;
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {phases.map((p) => {
        const c = data.countsByPhase[p];
        const pct = c.total > 0 ? Math.round((c.enabled / c.total) * 100) : 0;
        return (
          <div key={p} className="ac-card p-4">
            <div className="text-xs text-[color:var(--ac-ink-3)]">المرحلة {p}</div>
            <div className="text-2xl font-bold tabular-nums mt-1">
              {c.enabled}/{c.total}
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-indigo-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-[11px] text-[color:var(--ac-ink-3)] mt-1">{pct}%</div>
          </div>
        );
      })}
    </section>
  );
}

function PillarCard({
  pillar,
  flags,
  summary,
  busy,
  onToggle,
}: {
  pillar: V3Pillar;
  flags: V3FlagState[];
  summary: { total: number; enabled: number };
  busy: string | null;
  onToggle: (f: V3FlagState) => void;
}) {
  const Icon = PILLAR_ICON[pillar];
  const pct = summary.total > 0 ? Math.round((summary.enabled / summary.total) * 100) : 0;
  return (
    <section className="ac-card p-4 space-y-3">
      <header className="flex items-center gap-3">
        <div
          className={`h-9 w-9 rounded-xl grid place-items-center bg-gradient-to-br ${PILLAR_TONE[pillar]} text-white`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm">{PILLAR_LABEL[pillar]}</div>
          <div className="text-[11px] text-[color:var(--ac-ink-3)]">
            {summary.enabled}/{summary.total} مفعّل ({pct}%)
          </div>
        </div>
      </header>
      <ul className="space-y-2">
        {flags.map((f) => (
          <li
            key={f.key}
            className="flex items-start justify-between gap-3 p-2 rounded-lg border border-[color:var(--ac-line)]"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="truncate">{f.title}</span>
                <span className="text-[10px] text-[color:var(--ac-ink-3)] rounded-full border border-[color:var(--ac-line)] px-1.5">
                  م{f.phase}
                </span>
              </div>
              <p className="text-[11px] text-[color:var(--ac-ink-3)] mt-0.5">{f.description}</p>
              <div className="text-[10px] text-slate-400 font-mono mt-1">{f.key}</div>
            </div>
            <button
              type="button"
              disabled={busy === f.key}
              onClick={() => onToggle(f)}
              aria-pressed={f.enabled}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                f.enabled ? "bg-emerald-500" : "bg-slate-300"
              } ${busy === f.key ? "opacity-60" : ""}`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                  f.enabled ? "translate-x-1" : "translate-x-5"
                }`}
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
