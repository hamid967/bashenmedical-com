import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Download,
  RefreshCw,
  ChevronLeft,
  Filter,
  X,
  FileText,
  Scan,
} from "lucide-react";
import {
  listReportDownloadAudit,
  listReportDownloadActors,
} from "@/lib/report-audit.functions";
import { RequirePermission } from "@/components/rbac/RequirePermission";

const BUCKET_LABELS: Record<string, string> = {
  "lab-reports": "المختبر",
  "radiology-reports": "الأشعة",
};

const ACTION_LABELS: Record<string, { label: string; cls: string; icon: typeof FileText }> = {
  lab_report_download: {
    label: "تنزيل تقرير مختبر",
    cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    icon: FileText,
  },
  radiology_report_download: {
    label: "تنزيل تقرير أشعة",
    cls: "bg-teal-500/15 text-teal-700 border-teal-500/30",
    icon: Scan,
  },
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("ar-SA", {
      dateStyle: "short",
      timeStyle: "medium",
    });
  } catch {
    return iso;
  }
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function Page() {
  const runList = useServerFn(listReportDownloadAudit);
  const runActors = useServerFn(listReportDownloadActors);

  const [userId, setUserId] = useState("");
  const [reportId, setReportId] = useState("");
  const [bucket, setBucket] = useState<"all" | "lab-reports" | "radiology-reports">("all");
  const [action, setAction] = useState<
    "all" | "lab_report_download" | "radiology_report_download"
  >("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(200);

  const actorsQ = useQuery({
    queryKey: ["report-audit-actors"],
    queryFn: () => runActors(),
    staleTime: 60_000,
  });

  const logsQ = useQuery({
    queryKey: ["report-audit", userId, reportId, bucket, action, from, to, limit],
    queryFn: () =>
      runList({
        data: {
          user_id: userId || undefined,
          report_id: reportId || undefined,
          bucket,
          action,
          from: from || undefined,
          to: to || undefined,
          limit,
        },
      }),
  });

  const actors = actorsQ.data ?? [];
  const rows = logsQ.data ?? [];

  const activeFilters = useMemo(() => {
    const items: Array<{ label: string; clear: () => void }> = [];
    if (userId) {
      const u = actors.find((a) => a.id === userId);
      items.push({
        label: `المستخدم: ${u?.name ?? u?.phone ?? userId.slice(0, 8)}`,
        clear: () => setUserId(""),
      });
    }
    if (reportId) items.push({ label: `التقرير: ${reportId}`, clear: () => setReportId("") });
    if (bucket !== "all")
      items.push({ label: `النوع: ${BUCKET_LABELS[bucket]}`, clear: () => setBucket("all") });
    if (action !== "all")
      items.push({
        label: `الحدث: ${ACTION_LABELS[action]?.label ?? action}`,
        clear: () => setAction("all"),
      });
    if (from) items.push({ label: `من: ${from}`, clear: () => setFrom("") });
    if (to) items.push({ label: `إلى: ${to}`, clear: () => setTo("") });
    return items;
  }, [userId, reportId, bucket, action, from, to, actors]);

  const clearAll = () => {
    setUserId("");
    setReportId("");
    setBucket("all");
    setAction("all");
    setFrom("");
    setTo("");
  };

  const exportCsv = () => {
    const headers = [
      "created_at",
      "action",
      "actor_name",
      "actor_phone",
      "actor_id",
      "report_id",
      "patient_id",
      "bucket",
      "file_path",
      "ip_address",
      "user_agent",
    ];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.created_at,
          r.action,
          r.actor_name,
          r.actor_phone,
          r.actor,
          r.report_id,
          r.patient_id,
          r.bucket,
          r.file_path,
          r.ip_address,
          r.user_agent,
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-downloads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20" dir="rtl">
      <header className="border-b border-border/50 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex flex-wrap items-center gap-3">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
            العودة
          </Link>
          <div className="flex items-center gap-2 ms-2">
            <Download className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">سجل تنزيلات تقارير المختبر والأشعة</h1>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <button
              onClick={exportCsv}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50"
            >
              <Download className="w-3 h-3" />
              تصدير CSV
            </button>
            <button
              onClick={() => logsQ.refetch()}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <RefreshCw className={`w-3 h-3 ${logsQ.isFetching ? "animate-spin" : ""}`} />
              تحديث
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <section className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">فلاتر البحث</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">المستخدم (user_id)</span>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">الكل</option>
                {actors.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.phone ?? u.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">معرّف التقرير (report_id)</span>
              <input
                type="text"
                value={reportId}
                onChange={(e) => setReportId(e.target.value)}
                placeholder="UUID..."
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-mono"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">النوع (bucket)</span>
              <select
                value={bucket}
                onChange={(e) => setBucket(e.target.value as typeof bucket)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="all">الكل</option>
                <option value="lab-reports">المختبر</option>
                <option value="radiology-reports">الأشعة</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">نوع الحدث</span>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as typeof action)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="all">الكل</option>
                <option value="lab_report_download">تنزيل تقرير مختبر</option>
                <option value="radiology_report_download">تنزيل تقرير أشعة</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">من تاريخ</span>
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">إلى تاريخ</span>
              <input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground flex items-center gap-2">
              الحد:
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
              </select>
            </label>
            {activeFilters.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted inline-flex items-center gap-1"
              >
                <X className="w-3 h-3" /> مسح الفلاتر
              </button>
            )}
            {activeFilters.map((f, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20"
              >
                {f.label}
                <button onClick={f.clear} className="hover:text-primary/70">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">
              النتائج{" "}
              <span className="text-muted-foreground font-normal">({rows.length})</span>
            </h2>
          </div>

          {logsQ.isLoading ? (
            <div className="rounded-xl border border-border/60 bg-card p-10 text-center text-sm text-muted-foreground">
              جاري تحميل السجل...
            </div>
          ) : logsQ.isError ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-6 text-sm text-red-700">
              تعذّر تحميل السجل:{" "}
              {String(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (logsQ.error as any)?.message ?? logsQ.error,
              )}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              لا توجد عمليات تنزيل مطابقة للفلاتر الحالية.
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs">
                    <tr>
                      <th className="text-right p-3 font-medium">التاريخ</th>
                      <th className="text-right p-3 font-medium">الحدث</th>
                      <th className="text-right p-3 font-medium">المستخدم</th>
                      <th className="text-right p-3 font-medium">التقرير</th>
                      <th className="text-right p-3 font-medium">المريض</th>
                      <th className="text-right p-3 font-medium">النوع</th>
                      <th className="text-right p-3 font-medium">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const ac = ACTION_LABELS[r.action] ?? {
                        label: r.action,
                        cls: "bg-muted text-foreground/70 border-border",
                        icon: FileText,
                      };
                      const Icon = ac.icon;
                      return (
                        <tr
                          key={r.id}
                          className="border-t border-border/40 hover:bg-muted/20"
                        >
                          <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                            {fmtDate(r.created_at)}
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${ac.cls}`}
                            >
                              <Icon className="w-3 h-3" />
                              {ac.label}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="font-medium">
                              {r.actor_name ?? r.actor_phone ?? r.actor?.slice(0, 8) ?? "—"}
                            </div>
                            {r.actor_phone && r.actor_name && (
                              <div className="text-[11px] text-muted-foreground">
                                {r.actor_phone}
                              </div>
                            )}
                          </td>
                          <td className="p-3 font-mono text-[11px]">
                            {r.report_id ? r.report_id.slice(0, 8) : "—"}
                          </td>
                          <td className="p-3 font-mono text-[11px]">
                            {r.patient_id ? r.patient_id.slice(0, 8) : "—"}
                          </td>
                          <td className="p-3 text-xs">
                            {r.bucket ? BUCKET_LABELS[r.bucket] ?? r.bucket : "—"}
                          </td>
                          <td className="p-3 font-mono text-[11px] text-muted-foreground">
                            {r.ip_address ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/report-downloads-audit")({
  component: () => (
    <RequirePermission anyOf={["audit.view", "rbac.manage"]}>
      <Page />
    </RequirePermission>
  ),
});
