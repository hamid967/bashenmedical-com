/**
 * /portal/doctors — Doctors the patient has visited or has upcoming with.
 */
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowLeft, CalendarPlus, RefreshCw, Star, Stethoscope, UserRound,
} from "lucide-react";
import { listMyDoctors, type MyDoctor } from "@/lib/portal/my-doctors.functions";

const myDoctorsQuery = queryOptions({
  queryKey: ["portal", "my-doctors"],
  queryFn: () => listMyDoctors(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/portal/doctors")({
  loader: ({ context }) => context.queryClient.ensureQueryData(myDoctorsQuery),
  head: () => ({
    meta: [
      { title: "أطبائي | بوابة المريض" },
      { name: "description", content: "الأطباء الذين زرتهم أو لديك مواعيد قادمة معهم." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyDoctorsPage,
  errorComponent: ErrorState,
  pendingComponent: Skeleton,
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-SA-u-nu-latn", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function MyDoctorsPage() {
  const q = useSuspenseQuery(myDoctorsQuery);
  const doctors = q.data;

  return (
    <div className="portal-root portal-gradient-bg min-h-dvh" dir="rtl">
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
        <header className="mb-6 flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl grid place-items-center text-white" style={{ background: "var(--portal-gradient)" }}>
            <Stethoscope className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-[color:var(--portal-ink)]">أطبائي</h1>
            <p className="text-xs sm:text-sm text-[color:var(--portal-ink-2)]">
              الأطباء الذين لديك تاريخ زيارات معهم — {doctors.length} طبيب
            </p>
          </div>
          <button
            type="button"
            onClick={() => q.refetch()}
            disabled={q.isFetching}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-[color:var(--portal-border)] bg-white text-xs font-semibold text-[color:var(--portal-ink)] hover:bg-slate-50 disabled:opacity-60"
            aria-label="تحديث"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
            تحديث
          </button>
        </header>

        {doctors.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {doctors.map((d) => <DoctorCard key={d.id} d={d} />)}
          </div>
        )}
      </main>
    </div>
  );
}

function DoctorCard({ d }: { d: MyDoctor }) {
  return (
    <article className="glass-card p-4 sm:p-5 flex flex-col">
      <div className="flex items-start gap-3">
        {d.photo_url ? (
          <img src={d.photo_url} alt={d.name_ar} className="h-14 w-14 rounded-2xl object-cover border border-[color:var(--portal-border)]" />
        ) : (
          <div className="h-14 w-14 rounded-2xl bg-slate-100 grid place-items-center text-[color:var(--portal-ink-2)]">
            <UserRound className="h-6 w-6" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[color:var(--portal-ink)] leading-tight">{d.name_ar}</h3>
          {d.title_ar && <p className="mt-0.5 text-xs text-[color:var(--portal-ink-2)]">{d.title_ar}</p>}
          {d.specialty_ar && (
            <p className="mt-1 inline-flex items-center h-5 px-1.5 rounded-md bg-teal-50 text-teal-700 border border-teal-100 text-[10px] font-semibold">
              {d.specialty_ar}
            </p>
          )}
        </div>
        {d.avg_rating != null && (
          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-700">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
            {d.avg_rating.toFixed(1)}
          </span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <Stat label="زيارات سابقة" value={String(d.total_visits)} />
        <Stat label="مواعيد قادمة" value={String(d.upcoming_count)} tone={d.upcoming_count > 0 ? "ok" : "muted"} />
        <Stat label="آخر زيارة" value={formatDate(d.last_visit_date)} span />
        {d.branch_ar && <Stat label="الفرع" value={d.branch_ar} span />}
      </dl>

      <div className="mt-4 flex items-center justify-between gap-2">
        {d.slug ? (
          <Link to="/doctors/$slug" params={{ slug: d.slug }}
            className="text-xs font-semibold text-[color:var(--portal-primary)] hover:underline">
            الملف التعريفي
          </Link>
        ) : <span />}
        <Link
          to="/portal/book"
          search={{ doctorId: d.id, date: suggestNextDate(d.last_visit_date) }}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold text-white"
          style={{ background: "var(--portal-gradient)" }}
          aria-label={`احجز موعدًا جديدًا مع ${d.name_ar}`}
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          احجز مع هذا الطبيب
        </Link>
      </div>
    </article>
  );
}

/**
 * Suggest a booking date: last visit + ~90 days, but never in the past;
 * fall back to a week from today when there is no prior visit.
 */
function suggestNextDate(lastVisit: string | null): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const minDate = new Date(today);
  minDate.setDate(minDate.getDate() + 3);
  let candidate = minDate;
  if (lastVisit) {
    const from = new Date(`${lastVisit}T00:00:00`);
    if (!isNaN(from.getTime())) {
      from.setDate(from.getDate() + 90);
      if (from > candidate) candidate = from;
    }
  } else {
    const wk = new Date(today);
    wk.setDate(wk.getDate() + 7);
    if (wk > candidate) candidate = wk;
  }
  return candidate.toISOString().slice(0, 10);
}
function Stat({ label, value, tone, span }: { label: string; value: string; tone?: "ok" | "muted"; span?: boolean }) {
  const cls = tone === "ok"
    ? "bg-emerald-50 border-emerald-100 text-emerald-800"
    : tone === "muted"
      ? "bg-slate-50 border-slate-200 text-[color:var(--portal-ink-2)]"
      : "bg-slate-50 border-slate-200 text-[color:var(--portal-ink)]";
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${cls} ${span ? "col-span-2" : ""}`}>
      <div className="text-[10px] text-[color:var(--portal-ink-2)]">{label}</div>
      <div className="font-semibold text-xs">{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="glass-card p-10 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-white border border-[color:var(--portal-border)] text-[color:var(--portal-primary)]">
        <Stethoscope className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-lg font-bold">لم تزُر أي طبيب بعد</h2>
      <p className="mt-1 text-sm text-[color:var(--portal-ink-2)] max-w-md mx-auto">
        بعد أول موعد، سيظهر الطبيب هنا مع ملخّص زياراتك وآخر تاريخ زيارة.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Link to="/portal/book" className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full text-sm font-semibold text-white" style={{ background: "var(--portal-gradient)" }}>
          <CalendarPlus className="h-4 w-4" />احجز أول موعد
        </Link>
        <Link to="/doctors" className="h-10 px-5 rounded-full border border-[color:var(--portal-border)] bg-white text-sm inline-flex items-center gap-1.5">
          <UserRound className="h-4 w-4" />استعرض الأطباء
        </Link>
      </div>
    </div>
  );
}
function Skeleton() {
  return (
    <div className="portal-root portal-gradient-bg min-h-dvh" dir="rtl">
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <div className="h-11 w-56 rounded-2xl bg-slate-200/60 animate-pulse mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glass-card p-5 h-56 bg-slate-100 animate-pulse" />
          ))}
        </div>
      </main>
    </div>
  );
}
function ErrorState({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="portal-root portal-gradient-bg min-h-dvh grid place-items-center p-6" dir="rtl">
      <div className="glass-card max-w-md w-full p-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-red-500 mb-2" />
        <h2 className="text-lg font-bold">تعذّر تحميل قائمة أطبائك</h2>
        <p className="mt-2 text-sm text-[color:var(--portal-ink-2)]">{error.message}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="h-10 px-4 rounded-full text-white text-sm font-semibold" style={{ background: "var(--portal-gradient)" }}>
            <RefreshCw className="inline h-4 w-4 ms-1" />حاول مجددًا
          </button>
          <Link to="/portal" className="h-10 px-4 rounded-full border border-[color:var(--portal-border)] bg-white text-sm inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />العودة
          </Link>
        </div>
      </div>
    </div>
  );
}
