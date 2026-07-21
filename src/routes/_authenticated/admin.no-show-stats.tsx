/**
 * /admin/no-show-stats — No-show analytics with doctor/day breakdowns,
 * cancel-reason distribution, filters, and CSV export.
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Filter, TrendingDown, XCircle, CheckCircle2, Calendar, ArrowUp, ArrowDown, ArrowUpDown, Search, ChevronLeft, ChevronRight } from "lucide-react";
import {
  getNoShowStats,
  listDoctorsLite,
  listBranchesLite,
  type NoShowStats,
  type DoctorBreakdown,
  type DayBreakdown,
} from "@/lib/admin/no-show-stats.functions";

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const defaultFrom = isoOffset(-30);
const defaultTo = isoOffset(0);

const statsQuery = (from: string, to: string, doctorId: string, branchId: string) =>
  queryOptions({
    queryKey: ["admin", "no-show-stats", from, to, doctorId, branchId],
    queryFn: () =>
      getNoShowStats({
        data: {
          from,
          to,
          doctorId: doctorId || null,
          branchId: branchId || null,
        },
      }),
    staleTime: 30_000,
  });

const doctorsQuery = queryOptions({
  queryKey: ["admin", "doctors-lite"],
  queryFn: () => listDoctorsLite(),
  staleTime: 5 * 60_000,
});

const branchesQuery = queryOptions({
  queryKey: ["admin", "branches-lite"],
  queryFn: () => listBranchesLite(),
  staleTime: 5 * 60_000,
});

export const Route = createFileRoute("/_authenticated/admin/no-show-stats")({
  head: () => ({
    meta: [
      { title: "إحصاءات عدم الحضور | لوحة الإدارة" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(statsQuery(defaultFrom, defaultTo, "", "")),
  component: NoShowStatsPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">تعذّر تحميل الإحصاءات: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">غير موجود</div>,
});

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const csv = "\uFEFF" + rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function KpiCard({
  label, value, tone = "neutral", icon: Icon,
}: { label: string; value: string; tone?: "neutral" | "ok" | "bad" | "warn"; icon: React.ComponentType<{ className?: string }> }) {
  const tones: Record<string, string> = {
    neutral: "border-border bg-card text-foreground",
    ok: "border-green-500/30 bg-green-500/5 text-green-800",
    bad: "border-red-500/30 bg-red-500/5 text-red-800",
    warn: "border-amber-500/30 bg-amber-500/5 text-amber-900",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs opacity-80">{label}</span>
        <Icon className="h-4 w-4 opacity-70" />
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function NoShowStatsPage() {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [doctorId, setDoctorId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [applied, setApplied] = useState({ from: defaultFrom, to: defaultTo, doctorId: "", branchId: "" });

  const { data } = useSuspenseQuery(statsQuery(applied.from, applied.to, applied.doctorId, applied.branchId));
  const { data: doctors = [] } = useQuery(doctorsQuery);
  const { data: branches = [] } = useQuery(branchesQuery);

  const stats: NoShowStats = data;

  const activeDoctorName = useMemo(() => {
    if (!applied.doctorId) return "كل الأطباء";
    return doctors.find((d) => d.id === applied.doctorId)?.name_ar ?? applied.doctorId;
  }, [applied.doctorId, doctors]);

  function apply() {
    setApplied({ from, to, doctorId, branchId });
  }

  function reset() {
    setFrom(defaultFrom); setTo(defaultTo); setDoctorId(""); setBranchId("");
    setApplied({ from: defaultFrom, to: defaultTo, doctorId: "", branchId: "" });
  }

  function exportDoctorsCsv() {
    const header = ["الطبيب", "الإجمالي", "مكتمل", "لم يحضر", "ملغى", "مؤكد", "متوسط المخاطرة", "نسبة عدم الحضور %"];
    const rows = stats.byDoctor.map((r) => [
      r.doctor_name_ar ?? "بدون تخصيص",
      r.total, r.completed, r.no_show, r.cancelled, r.confirmed,
      r.avg_risk ?? "",
      r.no_show_rate,
    ]);
    downloadCsv(`no-show_by-doctor_${applied.from}_${applied.to}.csv`, [header, ...rows]);
  }

  function exportDaysCsv() {
    const header = ["التاريخ", "الإجمالي", "مكتمل", "لم يحضر", "ملغى", "نسبة عدم الحضور %"];
    const rows = stats.byDay.map((r) => [
      r.appointment_date, r.total, r.completed, r.no_show, r.cancelled, r.no_show_rate,
    ]);
    downloadCsv(`no-show_by-day_${applied.from}_${applied.to}.csv`, [header, ...rows]);
  }

  function exportReasonsCsv() {
    const header = ["سبب الإلغاء", "العدد"];
    const rows = stats.cancelReasons.map((r) => [r.reason, r.count]);
    downloadCsv(`cancel-reasons_${applied.from}_${applied.to}.csv`, [header, ...rows]);
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">إحصاءات عدم الحضور</h1>
          <p className="text-sm text-muted-foreground mt-1">
            توزيع الحالات وأسباب الإلغاء ومعدل عدم الحضور حسب الطبيب واليوم — قابل للتصدير CSV.
          </p>
        </div>
      </header>

      {/* Filters */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
          <Filter className="h-4 w-4" /> الفلاتر
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">من</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">إلى</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">الطبيب</span>
            <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">كل الأطباء</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">الفرع</span>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">كل الفروع</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name_ar}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button onClick={apply}
              className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
              تطبيق
            </button>
            <button onClick={reset}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
              مسح
            </button>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          النطاق النشط: {applied.from} → {applied.to} · {activeDoctorName}
        </p>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="إجمالي المواعيد" value={String(stats.totals.total)} icon={Calendar} />
        <KpiCard label="مكتمل" value={String(stats.totals.completed)} tone="ok" icon={CheckCircle2} />
        <KpiCard label="لم يحضر" value={String(stats.totals.no_show)} tone="bad" icon={XCircle} />
        <KpiCard label="ملغى" value={String(stats.totals.cancelled)} tone="warn" icon={XCircle} />
        <KpiCard label="نسبة عدم الحضور" value={`${stats.totals.no_show_rate}%`} tone={stats.totals.no_show_rate >= 15 ? "bad" : stats.totals.no_show_rate >= 8 ? "warn" : "ok"} icon={TrendingDown} />
        <KpiCard label="متوسط درجة المخاطرة" value={stats.totals.avg_risk == null ? "—" : `${stats.totals.avg_risk}/100`} icon={TrendingDown} />
      </section>

      {/* By doctor */}
      <SortableTable<DoctorBreakdown>
        title="التوزيع حسب الطبيب"
        rows={stats.byDoctor}
        searchPlaceholder="بحث باسم الطبيب…"
        searchFilter={(r, q) => (r.doctor_name_ar ?? "بدون تخصيص").toLowerCase().includes(q)}
        rowKey={(r) => r.doctor_id ?? "unassigned"}
        onExport={exportDoctorsCsv}
        defaultSort={{ key: "no_show_rate", dir: "desc" }}
        columns={[
          { key: "doctor_name_ar", label: "الطبيب", align: "start",
            accessor: (r) => r.doctor_name_ar ?? "بدون تخصيص",
            cell: (r) => <span className="font-medium">{r.doctor_name_ar ?? "بدون تخصيص"}</span> },
          { key: "total", label: "الإجمالي", align: "center", accessor: (r) => r.total,
            cell: (r) => <span className="tabular-nums">{r.total}</span> },
          { key: "completed", label: "مكتمل", align: "center", accessor: (r) => r.completed,
            cell: (r) => <span className="tabular-nums text-green-700">{r.completed}</span> },
          { key: "no_show", label: "لم يحضر", align: "center", accessor: (r) => r.no_show,
            cell: (r) => <span className="tabular-nums text-red-700">{r.no_show}</span> },
          { key: "cancelled", label: "ملغى", align: "center", accessor: (r) => r.cancelled,
            cell: (r) => <span className="tabular-nums text-amber-700">{r.cancelled}</span> },
          { key: "avg_risk", label: "متوسط المخاطرة", align: "center",
            accessor: (r) => r.avg_risk ?? -1,
            cell: (r) => <span className="tabular-nums">{r.avg_risk ?? "—"}</span> },
          { key: "no_show_rate", label: "نسبة عدم الحضور", align: "center",
            accessor: (r) => r.no_show_rate,
            cell: (r) => (
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                r.no_show_rate >= 15 ? "bg-red-500/10 text-red-700" :
                r.no_show_rate >= 8 ? "bg-amber-500/10 text-amber-800" :
                "bg-green-500/10 text-green-700"
              }`}>{r.no_show_rate}%</span>
            ) },
        ]}
      />

      {/* By day */}
      <SortableTable<DayBreakdown>
        title="التوزيع حسب اليوم"
        rows={stats.byDay}
        searchPlaceholder="بحث بالتاريخ (YYYY-MM-DD)…"
        searchFilter={(r, q) => r.appointment_date.includes(q)}
        rowKey={(r) => r.appointment_date}
        onExport={exportDaysCsv}
        defaultSort={{ key: "appointment_date", dir: "asc" }}
        columns={[
          { key: "appointment_date", label: "التاريخ", align: "start",
            accessor: (r) => r.appointment_date,
            cell: (r) => <span className="font-mono text-xs">{r.appointment_date}</span> },
          { key: "total", label: "الإجمالي", align: "center", accessor: (r) => r.total,
            cell: (r) => <span className="tabular-nums">{r.total}</span> },
          { key: "completed", label: "مكتمل", align: "center", accessor: (r) => r.completed,
            cell: (r) => <span className="tabular-nums text-green-700">{r.completed}</span> },
          { key: "no_show", label: "لم يحضر", align: "center", accessor: (r) => r.no_show,
            cell: (r) => <span className="tabular-nums text-red-700">{r.no_show}</span> },
          { key: "cancelled", label: "ملغى", align: "center", accessor: (r) => r.cancelled,
            cell: (r) => <span className="tabular-nums text-amber-700">{r.cancelled}</span> },
          { key: "no_show_rate", label: "نسبة عدم الحضور", align: "center",
            accessor: (r) => r.no_show_rate,
            cell: (r) => (
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                r.no_show_rate >= 15 ? "bg-red-500/10 text-red-700" :
                r.no_show_rate >= 8 ? "bg-amber-500/10 text-amber-800" :
                "bg-green-500/10 text-green-700"
              }`}>{r.no_show_rate}%</span>
            ) },
        ]}
      />

      {/* Cancel reasons */}
      <section className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-sm font-bold">توزيع أسباب الإلغاء</h2>
          <button onClick={exportReasonsCsv} disabled={!stats.cancelReasons.length}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> تصدير CSV
          </button>
        </div>
        <div className="p-4 space-y-2">
          {stats.cancelReasons.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">لا توجد أسباب إلغاء مسجّلة في هذا النطاق.</p>
          )}
          {stats.cancelReasons.map((r) => {
            const max = stats.cancelReasons[0]?.count || 1;
            const pct = Math.round((r.count / max) * 100);
            return (
              <div key={r.reason} className="flex items-center gap-3">
                <div className="w-64 shrink-0 text-sm truncate" title={r.reason}>{r.reason}</div>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <div className="w-12 text-end text-sm tabular-nums font-semibold">{r.count}</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

type SortDir = "asc" | "desc";
type SortState<T> = { key: keyof T & string; dir: SortDir };

type Column<T> = {
  key: keyof T & string;
  label: string;
  align?: "start" | "center" | "end";
  accessor: (row: T) => string | number;
  cell: (row: T) => React.ReactNode;
};

type SortableTableProps<T> = {
  title: string;
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onExport: () => void;
  defaultSort: SortState<T>;
  searchPlaceholder: string;
  searchFilter: (row: T, query: string) => boolean;
};

const PAGE_SIZES = [10, 25, 50, 100];

function SortableTable<T>({
  title, rows, columns, rowKey, onExport, defaultSort, searchPlaceholder, searchFilter,
}: SortableTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState<T>>(defaultSort);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => searchFilter(r, q));
  }, [rows, query, searchFilter]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.accessor(a);
      const bv = col.accessor(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "ar") * dir;
    });
  }, [filtered, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  function toggleSort(key: keyof T & string) {
    setSort((prev) => prev.key === key
      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key, dir: "desc" });
    setPage(1);
  }

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-border flex-wrap">
        <h2 className="text-sm font-bold">{title}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute start-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="ps-7 pe-2 py-1.5 text-xs rounded-md border border-border bg-background w-56"
            />
          </div>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            aria-label="عدد الصفوف لكل صفحة"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}/صفحة</option>)}
          </select>
          <button onClick={onExport} disabled={!rows.length}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> تصدير CSV
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              {columns.map((c) => {
                const active = sort.key === c.key;
                const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
                const alignClass = c.align === "center" ? "text-center" : c.align === "end" ? "text-end" : "text-start";
                const flexClass = c.align === "center" ? "justify-center" : c.align === "end" ? "justify-end" : "justify-start";
                return (
                  <th key={c.key} className={`${alignClass} p-3`}>
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={`inline-flex items-center gap-1 ${flexClass} hover:text-foreground ${active ? "text-foreground font-semibold" : ""}`}
                      aria-label={`فرز حسب ${c.label}`}
                    >
                      {c.label}
                      <Icon className="h-3 w-3 opacity-70" />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={columns.length} className="p-6 text-center text-sm text-muted-foreground">
                {query ? "لا نتائج تطابق البحث." : "لا توجد بيانات في هذا النطاق."}
              </td></tr>
            ) : pageRows.map((r) => (
              <tr key={rowKey(r)} className="border-t border-border/60">
                {columns.map((c) => (
                  <td key={c.key}
                    className={`p-3 ${c.align === "center" ? "text-center" : c.align === "end" ? "text-end" : ""}`}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 p-3 border-t border-border text-xs text-muted-foreground flex-wrap">
        <span>
          {sorted.length === 0 ? "٠" : `${start + 1}–${Math.min(start + pageSize, sorted.length)}`} من {sorted.length}
          {query && rows.length !== sorted.length && ` (مفلتر من ${rows.length})`}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-40"
            aria-label="السابق">
            <ChevronRight className="h-3.5 w-3.5 rtl:hidden" /><ChevronLeft className="h-3.5 w-3.5 hidden rtl:inline" />
            <span>السابق</span>
          </button>
          <span className="px-2 tabular-nums">{safePage} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-40"
            aria-label="التالي">
            <span>التالي</span>
            <ChevronLeft className="h-3.5 w-3.5 rtl:hidden" /><ChevronRight className="h-3.5 w-3.5 hidden rtl:inline" />
          </button>
        </div>
      </div>
    </section>
  );
}
