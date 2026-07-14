import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getMyMedicalRecords,
  getRecordFileUrl,
  getRecordsAiSummary,
  type TimelineItem,
  type TimelineKind,
  type RecordsAiSummary,
} from "@/lib/portal/records.functions";
import { Badge } from "@/components/ui/badge";
import { DemoBadge } from "@/components/DemoBadge";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Download,
  FileText,
  FlaskConical,
  Pill,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Syringe,
  UserRound,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { ar as arLocale } from "date-fns/locale";

const recordsQuery = queryOptions({
  queryKey: ["portal", "records"],
  queryFn: () => getMyMedicalRecords(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/portal/records")({
  loader: async ({ context }) => context.queryClient.ensureQueryData(recordsQuery),
  head: () => ({
    meta: [
      { title: "السجل الطبي | بوابة المريض" },
      { name: "description", content: "سجل طبي تفاعلي بتنسيق زمني مع ملخص AI وتنزيل الملفات." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RecordsPage,
  errorComponent: RecordsError,
  notFoundComponent: () => null,
});

function RecordsError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="glass-card max-w-md mx-auto p-8 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-4">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-bold">تعذّر تحميل السجل الطبي</h3>
      <p className="text-sm text-[color:var(--portal-ink-2)] mt-2 break-words">
        {error.message || "خطأ غير متوقع."}
      </p>
      <button
        onClick={() => { router.invalidate(); reset(); }}
        className="mt-5 inline-flex items-center gap-2 rounded-full px-4 h-10 text-sm font-semibold text-white"
        style={{ background: "var(--portal-gradient)" }}
      >
        <RefreshCw className="h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  );
}

type FilterKey = "all" | TimelineKind;

const FILTERS: { key: FilterKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "all", label: "الكل", icon: Activity },
  { key: "diagnosis", label: "التشخيصات", icon: Stethoscope },
  { key: "immunization", label: "التطعيمات", icon: Syringe },
  { key: "visit", label: "الزيارات", icon: UserRound },
  { key: "surgery", label: "العمليات", icon: ShieldAlert },
  { key: "lab", label: "المختبر", icon: FlaskConical },
  { key: "radiology", label: "الأشعة", icon: ScanLine },
  { key: "medication", label: "الأدوية", icon: Pill },
  { key: "prescription", label: "الوصفات", icon: FileText },
  { key: "allergy", label: "الحساسية", icon: AlertTriangle },
  { key: "attachment", label: "المرفقات", icon: FileText },
];

const KIND_STYLES: Record<TimelineKind, { bg: string; text: string; label: string }> = {
  visit: { bg: "bg-sky-50", text: "text-sky-600", label: "زيارة" },
  diagnosis: { bg: "bg-indigo-50", text: "text-indigo-600", label: "تشخيص" },
  surgery: { bg: "bg-rose-50", text: "text-rose-600", label: "عملية" },
  immunization: { bg: "bg-emerald-50", text: "text-emerald-600", label: "تطعيم" },
  medication: { bg: "bg-amber-50", text: "text-amber-600", label: "دواء" },
  allergy: { bg: "bg-red-50", text: "text-red-600", label: "حساسية" },
  lab: { bg: "bg-violet-50", text: "text-violet-600", label: "مختبر" },
  radiology: { bg: "bg-cyan-50", text: "text-cyan-600", label: "أشعة" },
  prescription: { bg: "bg-teal-50", text: "text-teal-600", label: "وصفة" },
  attachment: { bg: "bg-slate-100", text: "text-slate-600", label: "مرفق" },
};

function iconFor(kind: TimelineKind) {
  const map: Record<TimelineKind, React.ComponentType<{ className?: string }>> = {
    visit: UserRound,
    diagnosis: Stethoscope,
    surgery: ShieldAlert,
    immunization: Syringe,
    medication: Pill,
    allergy: AlertTriangle,
    lab: FlaskConical,
    radiology: ScanLine,
    prescription: FileText,
    attachment: FileText,
  };
  return map[kind];
}

function RecordsPage() {
  const { data } = useSuspenseQuery(recordsQuery);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [aiSummary, setAiSummary] = useState<RecordsAiSummary | null>(null);

  const items = useMemo(
    () => (filter === "all" ? data.items : data.items.filter((i) => i.kind === filter)),
    [data.items, filter],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, TimelineItem[]>();
    for (const it of items) {
      const year = (it.date || "").slice(0, 4) || "—";
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(it);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [items]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of data.items) c[it.kind] = (c[it.kind] ?? 0) + 1;
    return c;
  }, [data.items]);

  const downloadMut = useMutation({
    mutationFn: (input: { bucket: "lab-reports" | "radiology-reports" | "patient-files"; path: string }) =>
      getRecordFileUrl({ data: input }),
    onSuccess: (res) => {
      window.open(res.url, "_blank", "noopener,noreferrer");
    },
    onError: (err: any) => toast.error(err?.message ?? "تعذّر فتح الملف"),
  });

  const aiMut = useMutation({
    mutationFn: () => getRecordsAiSummary(),
    onSuccess: (res) => setAiSummary(res),
    onError: (err: any) => toast.error(err?.message ?? "تعذّر توليد الملخص"),
  });

  if (!data.patient) {
    return (
      <div className="glass-card max-w-lg mx-auto p-8 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-amber-50 text-amber-600 mb-4">
          <FileText className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-bold">لا يوجد ملف طبي مرتبط بعد</h3>
        <p className="text-sm text-[color:var(--portal-ink-2)] mt-2">
          سيتم إنشاء ملفك عند زيارتك الأولى للمجمع أو ربطه من قِبل الاستقبال.
        </p>
        <Link
          to="/portal/book"
          className="mt-5 inline-flex items-center gap-2 rounded-full px-5 h-10 text-sm font-semibold text-white"
          style={{ background: "var(--portal-gradient)" }}
        >
          احجز أول موعد
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">السجل الطبي</h1>
          <p className="text-sm text-[color:var(--portal-ink-2)] mt-1">
            رقم الملف الطبي: <span className="font-semibold">{data.patient.mrn ?? "—"}</span>
            {" • "}
            {data.patient.full_name_ar ?? data.patient.full_name_en ?? ""}
          </p>
        </div>
        <Link
          to="/portal"
          className="inline-flex items-center gap-2 text-sm text-[color:var(--portal-ink-2)] hover:text-[color:var(--portal-primary)]"
        >
          <ArrowLeft className="h-4 w-4" /> العودة
        </Link>
      </header>

      {/* AI summary card */}
      <section
        className="rounded-3xl p-5 md:p-6 text-white shadow-lg relative overflow-hidden"
        style={{ background: "var(--portal-gradient)" }}
      >
        <div className="absolute -top-8 -left-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-8 -right-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white/15 grid place-items-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs text-white/70">ملخص ذكي بواسطة AI</div>
              <h2 className="text-lg font-bold">
                {aiSummary?.headline ?? "احصل على قراءة سريعة لسجلك الطبي"}
              </h2>
            </div>
          </div>
          <button
            onClick={() => aiMut.mutate()}
            disabled={aiMut.isPending}
            className="inline-flex items-center gap-2 rounded-full bg-white/15 hover:bg-white/25 px-4 h-10 text-sm font-semibold backdrop-blur border border-white/20"
          >
            {aiMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiSummary ? "تحديث الملخص" : "توليد الملخص"}
          </button>
        </div>

        {aiSummary && (
          <div className="relative mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-white/10 border border-white/15 p-4">
              <div className="text-xs text-white/70 mb-2">أبرز النقاط</div>
              <ul className="space-y-2 text-sm">
                {aiSummary.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-white/80" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-white/10 border border-white/15 p-4">
              <div className="text-xs text-white/70 mb-2">متابعات مقترحة</div>
              <ul className="space-y-2 text-sm">
                {aiSummary.followUps.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span
                      className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
                        f.priority === "high"
                          ? "bg-rose-300"
                          : f.priority === "medium"
                          ? "bg-amber-300"
                          : "bg-emerald-300"
                      }`}
                    />
                    <div>
                      <div className="font-semibold">{f.title}</div>
                      <div className="text-white/80 text-xs mt-0.5">{f.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <p className="relative mt-4 text-xs text-white/70">
          هذا الملخص لأغراض معلوماتية فقط ولا يُعدّ استشارة طبية. راجع طبيبك عند الحاجة.
        </p>
      </section>

      {/* Filters */}
      <section className="flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {FILTERS.map(({ key, label, icon: Icon }) => {
          const active = filter === key;
          const count = key === "all" ? data.items.length : counts[key] ?? 0;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`shrink-0 inline-flex items-center gap-2 rounded-full h-9 px-4 text-sm font-semibold border transition-all ${
                active
                  ? "text-white border-transparent shadow-md"
                  : "bg-white border-[color:var(--portal-border)] text-[color:var(--portal-ink)] hover:border-[color:var(--portal-primary)]/40"
              }`}
              style={active ? { background: "var(--portal-gradient)" } : undefined}
            >
              <Icon className="h-4 w-4" /> {label}
              <span className={`text-[11px] rounded-full px-1.5 ${active ? "bg-white/20" : "bg-slate-100"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </section>

      {/* Timeline */}
      <section className="glass-card p-4 md:p-6">
        {items.length === 0 ? (
          <div className="py-12 text-center text-sm text-[color:var(--portal-ink-2)]">
            لا توجد سجلات ضمن هذا التصنيف.
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(([year, list]) => (
              <div key={year}>
                <h3 className="text-sm font-bold text-[color:var(--portal-ink-2)] mb-3 flex items-center gap-2">
                  <span className="h-px flex-1 bg-[color:var(--portal-border)]" />
                  <span>{year}</span>
                  <span className="h-px flex-1 bg-[color:var(--portal-border)]" />
                </h3>
                <ol className="relative border-s-2 border-[color:var(--portal-border)] ps-6 space-y-5">
                  {list.map((it) => {
                    const Icon = iconFor(it.kind);
                    const kstyle = KIND_STYLES[it.kind];
                    return (
                      <li key={it.id} className="relative">
                        <span
                          className={`absolute -start-[34px] top-1 h-8 w-8 rounded-full grid place-items-center border-2 border-white ${kstyle.bg} ${kstyle.text} shadow-sm`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="rounded-2xl border border-[color:var(--portal-border)] bg-white p-4 hover:shadow-sm transition-shadow">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className={`${kstyle.text} ${kstyle.bg} border-0 text-[11px]`}>
                                  {kstyle.label}
                                </Badge>
                                <span className="text-xs text-[color:var(--portal-ink-2)]">
                                  {it.date
                                    ? format(new Date(it.date), "d MMMM yyyy", { locale: arLocale })
                                    : "—"}
                                </span>
                                {it.status && (
                                  <Badge variant="outline" className="text-[11px]">
                                    {it.status}
                                  </Badge>
                                )}
                              </div>
                              <h4 className="font-bold mt-1.5 break-words flex items-center gap-2 flex-wrap"><span>{it.title}</span><DemoBadge show={/\(DEMO\)|^DEMO-/i.test(it.title ?? "")} /></h4>
                              {it.subtitle && (
                                <p className="text-xs text-[color:var(--portal-ink-2)] mt-0.5">
                                  {it.subtitle}
                                </p>
                              )}
                              {it.body && (
                                <p className="text-sm mt-2 text-[color:var(--portal-ink)] leading-relaxed whitespace-pre-line">
                                  {it.body}
                                </p>
                              )}
                              {it.meta?.next_due_on && (
                                <p className="text-xs mt-2 text-emerald-600 font-semibold">
                                  الجرعة التالية: {format(new Date(String(it.meta.next_due_on)), "d MMM yyyy", { locale: arLocale })}
                                </p>
                              )}
                            </div>
                            {it.file && (
                              <button
                                onClick={() =>
                                  downloadMut.mutate({
                                    bucket: it.file!.bucket as any,
                                    path: it.file!.path,
                                  })
                                }
                                disabled={downloadMut.isPending}
                                className="shrink-0 inline-flex items-center gap-2 rounded-full h-9 px-4 text-sm font-semibold border border-[color:var(--portal-primary)]/25 text-[color:var(--portal-primary)] bg-[color:var(--portal-primary)]/5 hover:bg-[color:var(--portal-primary)]/10"
                              >
                                {downloadMut.isPending && downloadMut.variables?.path === it.file.path ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4" />
                                )}
                                PDF
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
