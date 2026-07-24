import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getInboxSlaOverview, SLA_THRESHOLDS } from "@/lib/admin/inbox-sla.functions";
import { STATUS_LABELS, CHANNEL_LABELS, PRIORITY_LABELS } from "./admin.inbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Timer, CheckCircle2, Inbox as InboxIcon } from "lucide-react";

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  const s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}ي ${h}س`;
  if (h) return `${h}س ${m}د`;
  return `${m}د`;
}

export const Route = createFileRoute("/_authenticated/admin/inbox/sla")({
  head: () => ({
    meta: [
      { title: "SLA — الصندوق الموحّد" },
      { name: "description", content: "متوسط زمن الاستجابة والإنجاز وتنبيهات تجاوز حدود SLA" },
    ],
  }),
  component: SlaPage,
});

function SlaPage() {
  const fetchFn = useServerFn(getInboxSlaOverview);
  const [days, setDays] = useState<number>(30);
  const [fChannel, setFChannel] = useState<string>("");
  const [fBranch, setFBranch] = useState<string>("");
  const [fStatus, setFStatus] = useState<string>("");
  const { data, refetch, isFetching } = useSuspenseQuery({
    queryKey: ["inbox", "sla", days],
    queryFn: () => fetchFn({ data: { days } }),
    staleTime: 60_000,
  });

  const filteredBreaches = useMemo(
    () =>
      data.breaches.filter(
        (b) =>
          (!fChannel || b.channel === fChannel) &&
          (!fBranch || (b.branch_id ?? "__none__") === fBranch) &&
          (!fStatus || b.status === fStatus),
      ),
    [data.breaches, fChannel, fBranch, fStatus],
  );

  const branchOptions = useMemo(
    () => data.byBranch.map((b) => ({ key: b.key, label: b.label })),
    [data.byBranch],
  );
  const channelOptions = useMemo(() => data.byChannel.map((b) => b.key), [data.byChannel]);
  const statusOptions = useMemo(() => data.byStatus.map((b) => b.key), [data.byStatus]);

  const branchLabelOf = (id: string | null) =>
    !id
      ? "بدون فرع"
      : branchOptions.find((b) => b.key === id)?.label ?? id.slice(0, 8);

  const exportCsv = () => {
    const header = [
      "request_number",
      "patient_name",
      "channel",
      "branch",
      "priority",
      "status",
      "kind",
      "created_at",
      "age_minutes",
      "overdue_minutes",
      "threshold_minutes",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const b of filteredBreaches) {
      lines.push(
        [
          b.request_number,
          b.patient_name ?? "",
          CHANNEL_LABELS[b.channel] ?? b.channel,
          branchLabelOf(b.branch_id),
          PRIORITY_LABELS[b.priority] ?? b.priority,
          STATUS_LABELS[b.status] ?? b.status,
          b.kind === "response" ? "استجابة" : "إنجاز",
          b.created_at,
          Math.round(b.ageMs / 60000),
          Math.round(b.overdueMs / 60000),
          b.thresholdMin,
        ]
          .map(esc)
          .join(","),
      );
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sla-breaches-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const breachesByPriority = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of filteredBreaches) m[b.priority] = (m[b.priority] ?? 0) + 1;
    return m;
  }, [filteredBreaches]);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Timer className="w-6 h-6" /> لوحة SLA — الصندوق الموحّد
          </h1>
          <p className="text-sm text-muted-foreground">
            متوسط زمن الاستجابة والإنجاز حسب القناة والفرع والحالة، مع تنبيهات التجاوزات.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? "default" : "outline"}
              onClick={() => setDays(d)}
            >
              {d} يوم
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            تحديث
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          icon={<InboxIcon className="w-4 h-4" />}
          label="إجمالي الطلبات"
          value={String(data.totals.items)}
          sub={`مفتوحة: ${data.totals.open}`}
        />
        <Kpi
          icon={<Timer className="w-4 h-4" />}
          label="متوسط الاستجابة"
          value={fmtDuration(data.totals.avgFirstResponseMs)}
          sub={`تم الرد على ${data.totals.responded}`}
        />
        <Kpi
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="متوسط الإنجاز"
          value={fmtDuration(data.totals.avgResolutionMs)}
          sub={`أُنجز ${data.totals.resolved}`}
        />
        <Kpi
          icon={<AlertTriangle className="w-4 h-4 text-destructive" />}
          label="تجاوزات SLA"
          value={String(data.totals.breachedResponse + data.totals.breachedResolution)}
          sub={`استجابة ${data.totals.breachedResponse} • إنجاز ${data.totals.breachedResolution}`}
          highlight={data.totals.breachedResponse + data.totals.breachedResolution > 0}
        />
      </div>

      {/* Thresholds legend */}
      <Card className="p-4">
        <div className="text-sm font-semibold mb-2">حدود SLA (بحسب الأولوية)</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {(Object.keys(SLA_THRESHOLDS) as (keyof typeof SLA_THRESHOLDS)[]).map((p) => (
            <div key={p} className="flex items-center justify-between border rounded p-2">
              <span className="font-medium">{PRIORITY_LABELS[p]}</span>
              <span className="text-muted-foreground">
                استجابة {SLA_THRESHOLDS[p].firstResponseMin}د • إنجاز{" "}
                {Math.round(SLA_THRESHOLDS[p].resolutionMin / 60)}س
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Breakdown tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BucketTable
          title="حسب القناة"
          rows={data.byChannel.map((b) => ({
            ...b,
            label: CHANNEL_LABELS[b.key as keyof typeof CHANNEL_LABELS] ?? b.label,
          }))}
        />
        <BucketTable title="حسب الفرع" rows={data.byBranch} />
        <BucketTable
          title="حسب الحالة"
          rows={data.byStatus.map((b) => ({
            ...b,
            label: STATUS_LABELS[b.key as keyof typeof STATUS_LABELS] ?? b.label,
          }))}
        />
      </div>

      {/* Breaches */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <h2 className="text-lg font-bold">تنبيهات SLA النشطة</h2>
            <Badge variant="destructive">{filteredBreaches.length}</Badge>
            {filteredBreaches.length !== data.breaches.length && (
              <span className="text-xs text-muted-foreground">
                من إجمالي {data.breaches.length}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground flex gap-3">
            {Object.entries(breachesByPriority).map(([p, n]) => (
              <span key={p}>
                {PRIORITY_LABELS[p as keyof typeof PRIORITY_LABELS] ?? p}: {n}
              </span>
            ))}
          </div>
        </div>

        {/* Filters + Export */}
        <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
          <select
            value={fChannel}
            onChange={(e) => setFChannel(e.target.value)}
            className="border rounded px-2 py-1 bg-background"
          >
            <option value="">كل القنوات</option>
            {channelOptions.map((k) => (
              <option key={k} value={k}>
                {CHANNEL_LABELS[k as keyof typeof CHANNEL_LABELS] ?? k}
              </option>
            ))}
          </select>
          <select
            value={fBranch}
            onChange={(e) => setFBranch(e.target.value)}
            className="border rounded px-2 py-1 bg-background"
          >
            <option value="">كل الفروع</option>
            {branchOptions.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
          <select
            value={fStatus}
            onChange={(e) => setFStatus(e.target.value)}
            className="border rounded px-2 py-1 bg-background"
          >
            <option value="">كل الحالات</option>
            {statusOptions.map((k) => (
              <option key={k} value={k}>
                {STATUS_LABELS[k as keyof typeof STATUS_LABELS] ?? k}
              </option>
            ))}
          </select>
          {(fChannel || fBranch || fStatus) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setFChannel("");
                setFBranch("");
                setFStatus("");
              }}
            >
              مسح الفلاتر
            </Button>
          )}
          <div className="ms-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={exportCsv}
              disabled={filteredBreaches.length === 0}
            >
              تصدير CSV ({filteredBreaches.length})
            </Button>
          </div>
        </div>

        {filteredBreaches.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            {data.breaches.length === 0
              ? "لا توجد تجاوزات SLA حالية 🎉"
              : "لا توجد نتائج مطابقة للفلاتر"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground text-right">
                <tr>
                  <th className="p-2">الرقم</th>
                  <th className="p-2">المريض</th>
                  <th className="p-2">القناة</th>
                  <th className="p-2">الأولوية</th>
                  <th className="p-2">الحالة</th>
                  <th className="p-2">النوع</th>
                  <th className="p-2">العمر</th>
                  <th className="p-2">التجاوز</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredBreaches.map((b) => (
                  <tr key={`${b.id}-${b.kind}`} className="border-t hover:bg-muted/40">
                    <td className="p-2 font-mono text-xs">{b.request_number}</td>
                    <td className="p-2">{b.patient_name ?? "—"}</td>
                    <td className="p-2">
                      <Badge variant="outline">{CHANNEL_LABELS[b.channel] ?? b.channel}</Badge>
                    </td>
                    <td className="p-2">
                      <Badge variant={b.priority === "urgent" ? "destructive" : "secondary"}>
                        {PRIORITY_LABELS[b.priority]}
                      </Badge>
                    </td>
                    <td className="p-2">{STATUS_LABELS[b.status] ?? b.status}</td>
                    <td className="p-2">
                      <Badge variant={b.kind === "response" ? "secondary" : "destructive"}>
                        {b.kind === "response" ? "استجابة" : "إنجاز"}
                      </Badge>
                    </td>
                    <td className="p-2">{fmtDuration(b.ageMs)}</td>
                    <td className="p-2 text-destructive font-semibold">
                      +{fmtDuration(b.overdueMs)}
                    </td>
                    <td className="p-2">
                      <Link
                        to="/admin/inbox/$id"
                        params={{ id: b.id }}
                        className="text-primary underline text-xs"
                      >
                        فتح
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={`p-4 ${highlight ? "border-destructive" : ""}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

type Row = {
  key: string;
  label: string;
  count: number;
  responded: number;
  resolved: number;
  avgFirstResponseMs: number | null;
  avgResolutionMs: number | null;
  breachedResponse: number;
  breachedResolution: number;
};

function BucketTable({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <Card className="p-4">
      <div className="text-sm font-semibold mb-2">{title}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-6 text-center">لا توجد بيانات</div>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-muted-foreground text-right">
            <tr>
              <th className="p-1.5">—</th>
              <th className="p-1.5">العدد</th>
              <th className="p-1.5">م. الاستجابة</th>
              <th className="p-1.5">م. الإنجاز</th>
              <th className="p-1.5">تجاوز</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const breach = r.breachedResponse + r.breachedResolution;
              return (
                <tr key={r.key} className="border-t">
                  <td className="p-1.5 font-medium">{r.label}</td>
                  <td className="p-1.5">{r.count}</td>
                  <td className="p-1.5">{fmtDuration(r.avgFirstResponseMs)}</td>
                  <td className="p-1.5">{fmtDuration(r.avgResolutionMs)}</td>
                  <td className={`p-1.5 ${breach > 0 ? "text-destructive font-semibold" : ""}`}>
                    {breach}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}
