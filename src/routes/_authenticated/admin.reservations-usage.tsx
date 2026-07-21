/**
 * /admin/reservations-usage — لوحة "استخدام إدارة الحجوزات"
 * OTP sessions, cancel/reschedule volume, Undo success, slot-rebook rate.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  queryOptions,
  useSuspenseQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity,
  CalendarClock,
  MessageSquare,
  RefreshCw,
  Undo2,
  XCircle,
} from "lucide-react";
import {
  getReservationsUsageSummary,
  type DailyRow,
  type ReservationsUsageSummary,
} from "@/lib/admin/reservations-usage.functions";

const WINDOWS = [3, 7, 14, 30, 60, 90];

const summaryQuery = (windowDays: number) =>
  queryOptions({
    queryKey: ["admin", "reservations-usage", windowDays],
    queryFn: () => getReservationsUsageSummary({ data: { windowDays } }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/_authenticated/admin/reservations-usage")(
  {
    head: () => ({
      meta: [
        { title: "استخدام إدارة الحجوزات | لوحة الإدارة" },
        { name: "robots", content: "noindex" },
      ],
    }),
    loader: ({ context }) =>
      context.queryClient.ensureQueryData(summaryQuery(14)),
    component: ReservationsUsagePage,
  },
);

function ReservationsUsagePage() {
  const [windowDays, setWindowDays] = useState(14);
  const qc = useQueryClient();
  const { data, isFetching } = useSuspenseQuery(summaryQuery(windowDays));

  return (
    <div className="admin-console" dir="rtl">
      <div className="p-4 md:p-6 space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl grid place-items-center bg-[color:var(--ac-accent-soft)] text-[color:var(--ac-accent)]">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold">
                استخدام إدارة الحجوزات
              </h1>
              <p className="text-xs text-[color:var(--ac-ink-3)]">
                OTP، الإلغاء، إعادة الجدولة، ومعدلات نجاح التراجع (Undo)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              className="h-9 rounded-lg border border-[color:var(--ac-line)] px-3 text-sm bg-white"
              aria-label="النافذة الزمنية"
            >
              {WINDOWS.map((d) => (
                <option key={d} value={d}>
                  آخر {d} يوم
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                qc.invalidateQueries({
                  queryKey: ["admin", "reservations-usage"],
                })
              }
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ac-line)] px-3 h-9 text-sm hover:bg-[color:var(--ac-subtle)]"
            >
              <RefreshCw
                className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
              />
              تحديث
            </button>
          </div>
        </header>

        <TotalsRow data={data} />
        <RatesRow data={data} />
        <DailyChart daily={data.daily} />

        <div className="text-[11px] text-[color:var(--ac-ink-3)]">
          العينات: {data.totalSamples.toLocaleString("ar-EG")}
          {data.truncated
            ? " (مقتطعة — قلّل النافذة الزمنية لرؤية الأحدث)"
            : ""}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="ac-card p-4">
      <div className="flex items-center gap-2 text-xs text-[color:var(--ac-ink-3)]">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      {hint && (
        <div className="text-[11px] text-[color:var(--ac-ink-3)] mt-0.5">
          {hint}
        </div>
      )}
    </div>
  );
}

function TotalsRow({ data }: { data: ReservationsUsageSummary }) {
  const t = data.totals;
  const fmt = (n: number) => n.toLocaleString("ar-EG");
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        icon={<MessageSquare className="h-4 w-4" />}
        label="جلسات OTP (مُرسلة)"
        value={fmt(t.otp_sent)}
        hint={`تحقُّق ناجح: ${fmt(t.otp_verified)}`}
      />
      <StatCard
        icon={<XCircle className="h-4 w-4" />}
        label="إلغاءات"
        value={fmt(t.cancel)}
        hint={`إشعار قائمة انتظار: ${fmt(t.waitlist_notified)}`}
      />
      <StatCard
        icon={<Undo2 className="h-4 w-4" />}
        label="محاولات التراجع"
        value={fmt(t.cancel_undo_attempted)}
        hint={`ناجحة: ${fmt(t.cancel_undo_success)} · إعادة تثبيت: ${fmt(t.slot_rebooked)}`}
      />
      <StatCard
        icon={<CalendarClock className="h-4 w-4" />}
        label="إعادة جدولة"
        value={fmt(t.reschedule)}
      />
    </section>
  );
}

function RatesRow({ data }: { data: ReservationsUsageSummary }) {
  const r = data.rates;
  const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);
  return (
    <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <RateCard label="نسبة تحقّق OTP" value={pct(r.otp_verify_rate)} tone={r.otp_verify_rate} good={80} needs={50} />
      <RateCard label="استخدام التراجع" value={pct(r.undo_usage_rate)} tone={null} />
      <RateCard label="نجاح التراجع" value={pct(r.undo_success_rate)} tone={r.undo_success_rate} good={90} needs={70} />
      <RateCard label="إعادة تثبيت السلوت" value={pct(r.slot_rebook_rate)} tone={r.slot_rebook_rate} good={80} needs={50} />
      <RateCard label="استرجاع قائمة الانتظار" value={pct(r.waitlist_revert_rate)} tone={r.waitlist_revert_rate} good={80} needs={50} />
    </section>
  );
}

function RateCard({
  label,
  value,
  tone,
  good,
  needs,
}: {
  label: string;
  value: string;
  tone: number | null;
  good?: number;
  needs?: number;
}) {
  let cls = "bg-slate-50 text-slate-600 border-slate-200";
  if (tone !== null && good !== undefined && needs !== undefined) {
    if (tone >= good) cls = "bg-emerald-50 text-emerald-700 border-emerald-200";
    else if (tone >= needs) cls = "bg-amber-50 text-amber-700 border-amber-200";
    else cls = "bg-red-50 text-red-700 border-red-200";
  }
  return (
    <div className={`ac-card p-4 border ${cls}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}

function DailyChart({ daily }: { daily: DailyRow[] }) {
  const max = Math.max(
    1,
    ...daily.map((d) =>
      Math.max(d.otp_sent, d.cancel, d.reschedule, d.cancel_undo_success),
    ),
  );
  return (
    <section className="ac-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold mb-3">
        <Activity className="h-4 w-4" /> النشاط اليومي
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[color:var(--ac-ink-3)]">
              <th className="text-start py-1.5 pr-2">اليوم</th>
              <th className="text-start py-1.5 px-2">OTP مُرسلة</th>
              <th className="text-start py-1.5 px-2">تحقُّق</th>
              <th className="text-start py-1.5 px-2">إلغاء</th>
              <th className="text-start py-1.5 px-2">تراجع ناجح</th>
              <th className="text-start py-1.5 px-2">إعادة تثبيت</th>
              <th className="text-start py-1.5 px-2">إعادة جدولة</th>
              <th className="text-start py-1.5 pl-2">إشعار انتظار</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.day} className="border-t border-[color:var(--ac-line)]">
                <td className="py-1.5 pr-2 font-mono">{d.day}</td>
                <Cell value={d.otp_sent} max={max} tone="sky" />
                <Cell value={d.otp_verified} max={max} tone="emerald" />
                <Cell value={d.cancel} max={max} tone="red" />
                <Cell value={d.cancel_undo_success} max={max} tone="indigo" />
                <Cell value={d.slot_rebooked} max={max} tone="teal" />
                <Cell value={d.reschedule} max={max} tone="amber" />
                <Cell value={d.waitlist_notified} max={max} tone="violet" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const TONE: Record<string, string> = {
  sky: "bg-sky-400",
  emerald: "bg-emerald-400",
  red: "bg-red-400",
  indigo: "bg-indigo-400",
  teal: "bg-teal-400",
  amber: "bg-amber-400",
  violet: "bg-violet-400",
};

function Cell({
  value,
  max,
  tone,
}: {
  value: number;
  max: number;
  tone: keyof typeof TONE | string;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <td className="py-1.5 px-2">
      <div className="flex items-center gap-2">
        <span className="tabular-nums w-6 text-end">{value}</span>
        <span className="h-2 rounded-full bg-slate-100 flex-1 overflow-hidden">
          <span
            className={`block h-full ${TONE[tone] ?? "bg-slate-400"}`}
            style={{ width: `${pct}%` }}
          />
        </span>
      </div>
    </td>
  );
}
