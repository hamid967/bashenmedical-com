/**
 * /admin/booking-funnel — لوحة تحليل قمع الحجوزات.
 * تعرض الحالات (إنشاء/حجز/فشل/إلغاء) حسب المصدر والعيادة والطبيب.
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Activity, Filter, RefreshCw, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import {
  getBookingFunnel,
  type FunnelStatus,
  type FunnelSource,
  type FunnelSummary,
} from "@/lib/admin/booking-funnel.functions";

const WINDOWS = [3, 7, 14, 30, 60, 90];

const STATUS_LABEL: Record<FunnelStatus, string> = {
  held: "محجوز مؤقتًا (Hold)",
  pending_verification: "بانتظار التحقّق",
  pending_payment: "بانتظار الدفع",
  new: "جديد",
  confirmed: "مؤكّد",
  completed: "مكتمل",
  cancelled: "ملغى",
  no_show: "عدم حضور",
};

const STATUS_TONE: Record<FunnelStatus, string> = {
  held: "bg-slate-100 text-slate-700 border-slate-200",
  pending_verification: "bg-amber-50 text-amber-800 border-amber-200",
  pending_payment: "bg-amber-50 text-amber-800 border-amber-200",
  new: "bg-sky-50 text-sky-800 border-sky-200",
  confirmed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  completed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  cancelled: "bg-red-50 text-red-800 border-red-200",
  no_show: "bg-rose-50 text-rose-800 border-rose-200",
};

const SOURCE_LABEL: Record<FunnelSource, string> = {
  registered: "مسجّل",
  guest: "زائر",
  demo: "تجريبي",
};

type Filters = {
  windowDays: number;
  branchId: string | null;
  doctorId: string | null;
  source: FunnelSource | null;
};

const funnelQuery = (f: Filters) =>
  queryOptions({
    queryKey: ["admin", "booking-funnel", f],
    queryFn: () =>
      getBookingFunnel({
        data: {
          windowDays: f.windowDays,
          branchId: f.branchId,
          doctorId: f.doctorId,
          source: f.source,
        },
      }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/_authenticated/admin/booking-funnel")({
  head: () => ({
    meta: [
      { title: "قمع الحجوزات | لوحة الإدارة" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      funnelQuery({ windowDays: 14, branchId: null, doctorId: null, source: null }),
    ),
  component: BookingFunnelPage,
});

function BookingFunnelPage() {
  const [filters, setFilters] = useState<Filters>({
    windowDays: 14,
    branchId: null,
    doctorId: null,
    source: null,
  });
  const qc = useQueryClient();
  const { data, isFetching } = useSuspenseQuery(funnelQuery(filters));

  const patch = (p: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...p }));

  return (
    <div className="admin-console" dir="rtl">
      <div className="p-4 md:p-6 space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl grid place-items-center bg-[color:var(--ac-accent-soft)] text-[color:var(--ac-accent)]">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold">قمع الحجوزات</h1>
              <p className="text-xs text-[color:var(--ac-ink-3)]">
                حالات الطلب (إنشاء/حجز/فشل/إلغاء) حسب المصدر والفرع والطبيب
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => qc.invalidateQueries({ queryKey: ["admin", "booking-funnel"] })}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ac-line)] px-3 h-9 text-sm hover:bg-[color:var(--ac-subtle)]"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            تحديث
          </button>
        </header>

        <FiltersBar filters={filters} patch={patch} data={data} />
        <RatesRow data={data} />
        <FunnelBar data={data} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BreakdownCard
            title="حسب الفرع"
            rows={data.byBranch.map((r) => ({ key: r.branch_id ?? "-", label: r.name, count: r.count }))}
            total={data.total}
          />
          <BreakdownCard
            title="أعلى الأطباء"
            rows={data.byDoctor.map((r) => ({ key: r.doctor_id ?? "-", label: r.name, count: r.count }))}
            total={data.total}
          />
        </div>
        <BreakdownCard
          title="حسب المصدر"
          rows={(Object.keys(data.totalsBySource) as FunnelSource[]).map((s) => ({
            key: s,
            label: SOURCE_LABEL[s],
            count: data.totalsBySource[s],
          }))}
          total={data.total}
        />
        <DetailTable data={data} />
        <div className="text-[11px] text-[color:var(--ac-ink-3)]">
          الإجمالي: {data.total.toLocaleString("ar-EG")}
          {data.truncated ? " (مقتطعة — قلّل النافذة أو أضِف فلاتر لرؤية الأحدث)" : ""}
        </div>
      </div>
    </div>
  );
}

function FiltersBar({
  filters,
  patch,
  data,
}: {
  filters: Filters;
  patch: (p: Partial<Filters>) => void;
  data: FunnelSummary;
}) {
  return (
    <section className="ac-card p-3 flex flex-wrap items-center gap-2 text-sm">
      <div className="inline-flex items-center gap-1 text-[color:var(--ac-ink-3)] text-xs">
        <Filter className="h-3.5 w-3.5" /> الفلاتر
      </div>
      <select
        value={filters.windowDays}
        onChange={(e) => patch({ windowDays: Number(e.target.value) })}
        className="h-9 rounded-lg border border-[color:var(--ac-line)] px-3 bg-white"
        aria-label="النافذة الزمنية"
      >
        {WINDOWS.map((d) => (
          <option key={d} value={d}>
            آخر {d} يوم
          </option>
        ))}
      </select>
      <select
        value={filters.source ?? ""}
        onChange={(e) => patch({ source: (e.target.value || null) as FunnelSource | null })}
        className="h-9 rounded-lg border border-[color:var(--ac-line)] px-3 bg-white"
        aria-label="المصدر"
      >
        <option value="">كل المصادر</option>
        <option value="registered">مسجّل</option>
        <option value="guest">زائر</option>
        <option value="demo">تجريبي</option>
      </select>
      <select
        value={filters.branchId ?? ""}
        onChange={(e) => patch({ branchId: e.target.value || null })}
        className="h-9 rounded-lg border border-[color:var(--ac-line)] px-3 bg-white min-w-[160px]"
        aria-label="الفرع"
      >
        <option value="">كل الفروع</option>
        {data.branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <select
        value={filters.doctorId ?? ""}
        onChange={(e) => patch({ doctorId: e.target.value || null })}
        className="h-9 rounded-lg border border-[color:var(--ac-line)] px-3 bg-white min-w-[180px]"
        aria-label="الطبيب"
      >
        <option value="">كل الأطباء</option>
        {data.doctors.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      {(filters.branchId || filters.doctorId || filters.source) && (
        <button
          type="button"
          onClick={() => patch({ branchId: null, doctorId: null, source: null })}
          className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ac-line)] px-3 h-9 text-xs hover:bg-[color:var(--ac-subtle)]"
        >
          <XCircle className="h-3.5 w-3.5" /> مسح الفلاتر
        </button>
      )}
    </section>
  );
}

function RatesRow({ data }: { data: FunnelSummary }) {
  const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <RateCard
        icon={<TrendingUp className="h-4 w-4" />}
        label="نسبة التحوّل"
        value={pct(data.rates.conversion)}
        tone={data.rates.conversion}
        good={70}
        needs={40}
      />
      <RateCard
        icon={<XCircle className="h-4 w-4" />}
        label="نسبة الإلغاء"
        value={pct(data.rates.cancellation)}
        tone={data.rates.cancellation === null ? null : 100 - data.rates.cancellation}
        good={85}
        needs={70}
      />
      <RateCard
        icon={<TrendingDown className="h-4 w-4" />}
        label="عدم الحضور"
        value={pct(data.rates.noShow)}
        tone={data.rates.noShow === null ? null : 100 - data.rates.noShow}
        good={90}
        needs={80}
      />
      <RateCard
        icon={<Activity className="h-4 w-4" />}
        label="بقاء بالـ Hold"
        value={pct(data.rates.holdDrop)}
        tone={data.rates.holdDrop === null ? null : 100 - data.rates.holdDrop}
        good={95}
        needs={85}
      />
    </section>
  );
}

function RateCard({
  icon,
  label,
  value,
  tone,
  good,
  needs,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: number | null;
  good?: number;
  needs?: number;
}) {
  let cls = "bg-slate-50 text-slate-700 border-slate-200";
  if (tone !== null && good !== undefined && needs !== undefined) {
    if (tone >= good) cls = "bg-emerald-50 text-emerald-700 border-emerald-200";
    else if (tone >= needs) cls = "bg-amber-50 text-amber-700 border-amber-200";
    else cls = "bg-red-50 text-red-700 border-red-200";
  }
  return (
    <div className={`ac-card p-4 border ${cls}`}>
      <div className="flex items-center gap-2 text-xs opacity-80">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}

function FunnelBar({ data }: { data: FunnelSummary }) {
  const statuses: FunnelStatus[] = [
    "held",
    "pending_verification",
    "pending_payment",
    "new",
    "confirmed",
    "completed",
    "cancelled",
    "no_show",
  ];
  const max = useMemo(
    () => Math.max(1, ...statuses.map((s) => data.totalsByStatus[s] ?? 0)),
    [data],
  );
  return (
    <section className="ac-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold mb-3">
        <Activity className="h-4 w-4" /> توزيع الحالات
      </div>
      <div className="space-y-1.5">
        {statuses.map((s) => {
          const count = data.totalsByStatus[s] ?? 0;
          const pct = Math.round((count / max) * 100);
          return (
            <div key={s} className="flex items-center gap-2 text-xs">
              <span className={`inline-block px-2 py-0.5 rounded-full border ${STATUS_TONE[s]} min-w-[140px] text-center`}>
                {STATUS_LABEL[s]}
              </span>
              <span className="h-2 rounded-full bg-slate-100 flex-1 overflow-hidden">
                <span
                  className="block h-full bg-[color:var(--ac-accent)]"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="tabular-nums w-14 text-end font-semibold">
                {count.toLocaleString("ar-EG")}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BreakdownCard({
  title,
  rows,
  total,
}: {
  title: string;
  rows: Array<{ key: string; label: string; count: number }>;
  total: number;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="ac-card p-4">
      <div className="text-sm font-semibold mb-3">{title}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-[color:var(--ac-ink-3)]">لا بيانات</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => {
            const pct = Math.round((r.count / max) * 100);
            const share = total > 0 ? Math.round((r.count / total) * 100) : 0;
            return (
              <div key={r.key} className="flex items-center gap-2 text-xs">
                <span className="min-w-[140px] truncate">{r.label}</span>
                <span className="h-2 rounded-full bg-slate-100 flex-1 overflow-hidden">
                  <span
                    className="block h-full bg-sky-400"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="tabular-nums w-12 text-end font-semibold">
                  {r.count.toLocaleString("ar-EG")}
                </span>
                <span className="tabular-nums w-10 text-end text-[color:var(--ac-ink-3)]">
                  {share}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DetailTable({ data }: { data: FunnelSummary }) {
  const branchName = new Map(data.branches.map((b) => [b.id, b.name]));
  const doctorName = new Map(data.doctors.map((d) => [d.id, d.name]));
  const rows = data.rows.slice(0, 200);
  return (
    <section className="ac-card p-4">
      <div className="text-sm font-semibold mb-3">تفصيل (أعلى 200 صف)</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[color:var(--ac-ink-3)]">
              <th className="text-start py-1.5 pr-2">الحالة</th>
              <th className="text-start py-1.5 px-2">المصدر</th>
              <th className="text-start py-1.5 px-2">الفرع</th>
              <th className="text-start py-1.5 px-2">الطبيب</th>
              <th className="text-start py-1.5 pl-2">العدد</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-[color:var(--ac-line)]">
                <td className="py-1.5 pr-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full border ${STATUS_TONE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="py-1.5 px-2">{SOURCE_LABEL[r.source]}</td>
                <td className="py-1.5 px-2">
                  {r.branch_id ? branchName.get(r.branch_id) ?? r.branch_id.slice(0, 8) : "—"}
                </td>
                <td className="py-1.5 px-2">
                  {r.doctor_id ? doctorName.get(r.doctor_id) ?? r.doctor_id.slice(0, 8) : "—"}
                </td>
                <td className="py-1.5 pl-2 tabular-nums font-semibold">
                  {r.count.toLocaleString("ar-EG")}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[color:var(--ac-ink-3)]">
                  لا بيانات في هذه النافذة
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
