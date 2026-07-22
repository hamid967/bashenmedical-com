/**
 * /portal/usage — patient-visible AI usage history.
 * Lists every AI stream request (model, tokens, latency, cost) for the
 * signed-in user with per-model and per-surface aggregates.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listMyAiUsage, type UsageResponse } from "@/lib/ai/usage.functions";
import { PortalPageHeader, PortalCard } from "@/components/portal/ui";
import { useI18n } from "@/lib/i18n";
import { formatCredits, formatTokens } from "@/lib/ai/pricing";
import { Loader2, Activity, Coins, Cpu, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/portal/usage")({
  head: () => ({
    meta: [
      { title: "سجل الاستخدام | AI Usage History" },
      {
        name: "description",
        content:
          "استعرض تكلفة كل رسالة، عدد التوكنات، والزمن والطراز المستخدم في محادثاتك مع مساعد باعشن.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: UsagePage,
});

const WINDOWS = [
  { days: 7, ar: "٧ أيام", en: "7 days" },
  { days: 30, ar: "٣٠ يومًا", en: "30 days" },
  { days: 90, ar: "٩٠ يومًا", en: "90 days" },
];

function UsagePage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const fetchUsage = useServerFn(listMyAiUsage);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchUsage({ data: { windowDays: days, limit: 200 } })
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "خطأ");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, fetchUsage]);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(isAr ? "ar-SA" : "en-GB"), {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [isAr],
  );

  return (
    <div className="space-y-6" dir={(isAr ? "rtl" : "ltr")}>
      <PortalPageHeader
        title={(isAr ? "سجل الاستخدام" : "AI Usage History")}
        description={(isAr ? "التكلفة والزمن والتوكنات والطراز لكل رسالة." : "Cost, latency, tokens and model for each message.")
        }
        isAr={isAr}
      />

      <div className="flex flex-wrap gap-2">
        {WINDOWS.map((w) => (
          <button
            key={w.days}
            onClick={() => setDays(w.days)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm border transition-colors",
              days === w.days
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted border-border",
            )}
          >
            {isAr ? w.ar : w.en}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {(isAr ? "جارٍ التحميل…" : "Loading…")}
        </div>
      )}

      {error && (
        <PortalCard className="border-destructive/40 bg-destructive/5 text-destructive text-sm">
          {error}
        </PortalCard>
      )}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={Activity}
              label={(isAr ? "الرسائل" : "Messages")}
              value={String(data.summary.totalMessages)}
            />
            <StatCard
              icon={Cpu}
              label={(isAr ? "إجمالي التوكنات" : "Total tokens")}
              value={formatTokens(data.summary.totalTokens)}
              sub={
                isAr
                  ? `مدخل ${formatTokens(data.summary.totalPromptTokens)} · مخرج ${formatTokens(data.summary.totalCompletionTokens)}`
                  : `in ${formatTokens(data.summary.totalPromptTokens)} · out ${formatTokens(data.summary.totalCompletionTokens)}`
              }
            />
            <StatCard
              icon={Coins}
              label={(isAr ? "الائتمانات" : "Credits")}
              value={formatCredits(data.summary.totalCredits)}
            />
            <StatCard
              icon={Clock}
              label={(isAr ? "متوسط الزمن" : "Avg latency")}
              value={
                data.summary.avgLatencyMs != null ? `${data.summary.avgLatencyMs} ms` : "—"
              }
            />
          </div>

          {data.summary.byModel.length > 0 && (
            <PortalCard>
              <h3 className="text-sm font-semibold mb-3">
                {(isAr ? "حسب الطراز" : "By model")}
              </h3>
              <div className="space-y-1 text-sm">
                {data.summary.byModel.map((m) => (
                  <div
                    key={m.model}
                    className="flex items-center justify-between gap-3 border-b border-border/40 last:border-0 py-1.5"
                  >
                    <span className="font-mono text-xs">{m.model}</span>
                    <span className="text-muted-foreground text-xs">
                      {m.count} · {formatTokens(m.tokens)} · {formatCredits(m.credits)}
                    </span>
                  </div>
                ))}
              </div>
            </PortalCard>
          )}

          <PortalCard className="overflow-x-auto">
            <h3 className="text-sm font-semibold mb-3">
              {(isAr ? "أحدث الرسائل" : "Recent messages")}
            </h3>
            <table className="w-full text-sm min-w-[720px]">
              <thead className="text-xs text-muted-foreground text-start">
                <tr className="border-b border-border/60">
                  <th className="py-2 text-start">{(isAr ? "التاريخ" : "Date")}</th>
                  <th className="py-2 text-start">{(isAr ? "الواجهة" : "Surface")}</th>
                  <th className="py-2 text-start">{(isAr ? "الطراز" : "Model")}</th>
                  <th className="py-2 text-end">{(isAr ? "مدخل" : "In")}</th>
                  <th className="py-2 text-end">{(isAr ? "مخرج" : "Out")}</th>
                  <th className="py-2 text-end">{(isAr ? "الزمن" : "Latency")}</th>
                  <th className="py-2 text-end">{(isAr ? "التكلفة" : "Credits")}</th>
                  <th className="py-2 text-start">{(isAr ? "الحالة" : "Status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/30 last:border-0">
                    <td className="py-2 whitespace-nowrap text-xs">
                      {dateFmt.format(new Date(r.created_at))}
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
                    <td className="py-2">
                      <StatusPill row={r} isAr={isAr} />
                    </td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground text-sm">
                      {(isAr ? "لا توجد رسائل خلال هذه الفترة." : "No messages in this window.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {data.hasMore && (
              <p className="mt-3 text-xs text-muted-foreground">
                {(isAr ? "تُعرض أحدث ٢٠٠ رسالة. قلّل الفترة لعرض تفاصيل أدق." : "Showing latest 200. Narrow the window to see more detail.")}
              </p>
            )}
          </PortalCard>
        </>
      )}
    </div>
  );
}

function StatCard({
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
    <PortalCard>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </PortalCard>
  );
}

function StatusPill({
  row,
  isAr,
}: {
  row: { completed: boolean; aborted: boolean; error_type: string | null };
  isAr: boolean;
}) {
  if (row.error_type) {
    return (
      <span className="text-[11px] rounded-full px-2 py-0.5 bg-destructive/10 text-destructive">
        {(isAr ? "خطأ" : "error")}
      </span>
    );
  }
  if (row.aborted) {
    return (
      <span className="text-[11px] rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
        {(isAr ? "أُوقف" : "aborted")}
      </span>
    );
  }
  if (row.completed) {
    return (
      <span className="text-[11px] rounded-full px-2 py-0.5 bg-emerald-500/10 text-emerald-600">
        {(isAr ? "مكتمل" : "done")}
      </span>
    );
  }
  return (
    <span className="text-[11px] rounded-full px-2 py-0.5 bg-amber-500/10 text-amber-600">
      {(isAr ? "جزئي" : "partial")}
    </span>
  );
}
