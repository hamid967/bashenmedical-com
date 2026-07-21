import { createFileRoute, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getMyLabReports,
  getLabFileUrl,
  getLabShareDoctors,
  shareLabWithDoctor,
  type LabReport,
} from "@/lib/portal/lab.functions";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  FlaskConical,
  Loader2,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ar as arLocale } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
} from "recharts";

const labsQuery = queryOptions({
  queryKey: ["portal", "labs"],
  queryFn: () => getMyLabReports(),
  staleTime: 30_000,
});

const doctorsQuery = queryOptions({
  queryKey: ["portal", "labs", "doctors"],
  queryFn: () => getLabShareDoctors(),
  staleTime: 5 * 60_000,
});

export const Route = createFileRoute("/_authenticated/portal/laboratory")({
  loader: async ({ context }) => context.queryClient.ensureQueryData(labsQuery),
  head: () => ({
    meta: [
      { title: "نتائج المختبر | بوابة المريض" },
      {
        name: "description",
        content: "عرض نتائج التحاليل بألوان ونطاقات طبيعية ورسوم بيانية مع تنزيل ومشاركة مع الطبيب.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LaboratoryPage,
  errorComponent: LabsError,
  notFoundComponent: () => null,
});

function LabsError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="glass-card max-w-md mx-auto p-8 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-4">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-bold">تعذّر تحميل نتائج المختبر</h3>
      <p className="text-sm text-[color:var(--portal-ink-2)] mt-2 break-words">
        {error.message || "خطأ غير متوقع."}
      </p>
      <button
        onClick={() => { router.invalidate(); reset(); }}
        className="mt-5 inline-flex items-center gap-2 rounded-full px-4 h-10 text-sm font-semibold text-[color:var(--portal-on-primary)]"
        style={{ background: "var(--portal-gradient)" }}
      >
        <RefreshCw className="h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  );
}

/* ------------------------ result parsing ------------------------ */

type ParsedResult = {
  name: string;
  value: number;
  unit: string;
  low: number;
  high: number;
  flag: "low" | "normal" | "high";
};

// Matches: "Name: 12.3 unit (10-15)"  |  "Name = 12.3 (10 - 15)"  |  "Name : 12 mg/dL [10-15]"
const RESULT_RE =
  /^\s*([\p{L}\p{M}\s\.\-\+/&,()'0-9]{2,60}?)\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*([%A-Za-zµμ\/\^0-9\.\-]{0,20})?\s*[\(\[]\s*(-?\d+(?:\.\d+)?)\s*[\-–—]\s*(-?\d+(?:\.\d+)?)\s*[\)\]]/u;

function parseSummary(summary: string | null | undefined): ParsedResult[] {
  if (!summary) return [];
  const out: ParsedResult[] = [];
  for (const raw of summary.split(/\r?\n|;|،/)) {
    const m = raw.match(RESULT_RE);
    if (!m) continue;
    const value = Number(m[2]);
    const low = Number(m[4]);
    const high = Number(m[5]);
    if (!Number.isFinite(value) || !Number.isFinite(low) || !Number.isFinite(high)) continue;
    const flag: ParsedResult["flag"] =
      value < low ? "low" : value > high ? "high" : "normal";
    out.push({
      name: m[1].trim(),
      value,
      unit: (m[3] ?? "").trim(),
      low,
      high,
      flag,
    });
  }
  return out;
}

/* ------------------------ category colors ------------------------ */

const CATEGORY_STYLES: Record<string, { bg: string; ring: string; icon: string; label: string }> = {
  hematology: { bg: "from-rose-50 to-rose-100/50", ring: "ring-rose-200", icon: "text-rose-600", label: "أمراض الدم" },
  chemistry:  { bg: "from-teal-50 to-teal-100/50",  ring: "ring-teal-200",  icon: "text-teal-600",  label: "الكيمياء الحيوية" },
  hormones:   { bg: "from-teal-50 to-teal-100/50", ring: "ring-teal-200", icon: "text-teal-600", label: "الهرمونات" },
  urine:      { bg: "from-amber-50 to-amber-100/50", ring: "ring-amber-200", icon: "text-amber-700", label: "تحليل البول" },
  microbiology:{bg: "from-emerald-50 to-emerald-100/50", ring: "ring-emerald-200", icon: "text-emerald-600", label: "الأحياء الدقيقة" },
  serology:   { bg: "from-teal-50 to-teal-100/50", ring: "ring-teal-200", icon: "text-teal-600", label: "المصلية" },
  lipid:      { bg: "from-orange-50 to-orange-100/50", ring: "ring-orange-200", icon: "text-orange-600", label: "الدهون" },
  other:      { bg: "from-slate-50 to-slate-100/50", ring: "ring-slate-200", icon: "text-slate-600", label: "أخرى" },
};

function categoryOf(report: LabReport): keyof typeof CATEGORY_STYLES {
  const t = `${report.test_type ?? ""} ${report.title ?? ""}`.toLowerCase();
  if (/cbc|hemo|hgb|hct|platelet|wbc|rbc|hema|دم/.test(t)) return "hematology";
  if (/hba1c|glucose|creatinin|urea|alt|ast|liver|kidney|electrolyt|na|potassium|كيمياء|سكر|كلى|كبد/.test(t)) return "chemistry";
  if (/tsh|t3|t4|thyroid|cortisol|estrogen|testosteron|hormone|هرمون|درقية/.test(t)) return "hormones";
  if (/urine|بول/.test(t)) return "urine";
  if (/culture|micro|bacteri|زرع|جرث/.test(t)) return "microbiology";
  if (/hiv|hepatit|antibody|antigen|serolog|مصل/.test(t)) return "serology";
  if (/lipid|cholesterol|ldl|hdl|triglycer|دهون|كولسترول/.test(t)) return "lipid";
  return "other";
}

/* ------------------------ page ------------------------ */

function LaboratoryPage() {
  const { data } = useSuspenseQuery(labsQuery);
  const reports = data.reports;

  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");
  const [selectedForChart, setSelectedForChart] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState<LabReport | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const enriched = useMemo(
    () => reports.map((r) => ({ ...r, _cat: categoryOf(r), _parsed: parseSummary(r.summary) })),
    [reports],
  );

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of enriched) counts.set(r._cat, (counts.get(r._cat) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [enriched]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return enriched.filter((r) => {
      if (activeCat !== "all" && r._cat !== activeCat) return false;
      if (!needle) return true;
      return (
        (r.title ?? "").toLowerCase().includes(needle) ||
        (r.test_type ?? "").toLowerCase().includes(needle) ||
        (r.summary ?? "").toLowerCase().includes(needle)
      );
    });
  }, [enriched, q, activeCat]);

  // KPIs
  const kpi = useMemo(() => {
    let normal = 0, abnormal = 0, total = 0;
    for (const r of enriched) for (const p of r._parsed) {
      total++;
      if (p.flag === "normal") normal++;
      else abnormal++;
    }
    return { normal, abnormal, total };
  }, [enriched]);

  // Trend series for a selected test name (by canonical lowercase)
  const trendSeries = useMemo(() => {
    if (!selectedForChart) return { series: [], low: 0, high: 0, unit: "", name: "" };
    const points: { date: string; value: number; ts: number }[] = [];
    let low = NaN, high = NaN, unit = "", name = "";
    for (const r of enriched) {
      if (!r.report_date) continue;
      for (const p of r._parsed) {
        if (p.name.toLowerCase() !== selectedForChart) continue;
        points.push({
          date: r.report_date,
          value: p.value,
          ts: new Date(r.report_date).getTime(),
        });
        low = p.low; high = p.high; unit = p.unit; name = p.name;
      }
    }
    points.sort((a, b) => a.ts - b.ts);
    return { series: points, low, high, unit, name };
  }, [enriched, selectedForChart]);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[color:var(--portal-ink-2)] tracking-wider">
              LABORATORY RESULTS
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mt-1">نتائج المختبر</h1>
            <p className="text-sm text-[color:var(--portal-ink-2)] mt-1">
              بطاقات ملوّنة لكل تحليل مع النطاقات الطبيعية ورسوم بيانية للمقارنة الزمنية.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <KpiPill label="طبيعية" value={kpi.normal} tone="ok" />
            <KpiPill label="خارج النطاق" value={kpi.abnormal} tone="warn" />
            <KpiPill label="إجمالي القيم" value={kpi.total} tone="neutral" />
          </div>
        </div>

        {/* Search + filters */}
        <div className="mt-6 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--portal-ink-2)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالاسم أو نوع التحليل…"
              className="w-full h-11 rounded-2xl bg-white/70 pr-10 pl-4 text-sm border border-white/60 outline-none focus:ring-2 focus:ring-[color:var(--portal-accent)]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <CatChip active={activeCat === "all"} onClick={() => setActiveCat("all")} label="الكل" count={enriched.length} />
            {categories.map(([cat, n]) => (
              <CatChip
                key={cat}
                active={activeCat === cat}
                onClick={() => setActiveCat(cat)}
                label={CATEGORY_STYLES[cat]?.label ?? cat}
                count={n}
                tone={cat}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Trend chart */}
      {trendSeries.series.length > 1 && (
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs font-semibold text-[color:var(--portal-ink-2)]">CHART</div>
              <h3 className="text-lg font-bold">{trendSeries.name} — التطور الزمني</h3>
            </div>
            <button
              onClick={() => setSelectedForChart(null)}
              className="text-sm text-[color:var(--portal-ink-2)] hover:text-[color:var(--portal-ink)] inline-flex items-center gap-1"
            >
              <X className="h-4 w-4" /> إغلاق
            </button>
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={trendSeries.series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => format(parseISO(d), "MMM d", { locale: arLocale })}
                  stroke="#64748b"
                  fontSize={12}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={12}
                  label={{ value: trendSeries.unit, angle: -90, position: "insideLeft", fontSize: 11 }}
                />
                <Tooltip
                  formatter={(v: number) => [`${v} ${trendSeries.unit}`, trendSeries.name]}
                  labelFormatter={(d) => format(parseISO(String(d)), "PPP", { locale: arLocale })}
                />
                <ReferenceArea y1={trendSeries.low} y2={trendSeries.high} fill="#10b981" fillOpacity={0.08} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#0ea5e9"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#0ea5e9" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-[color:var(--portal-ink-2)] mt-2">
            المنطقة الخضراء تمثل النطاق الطبيعي ({trendSeries.low}–{trendSeries.high} {trendSeries.unit}).
          </p>
        </div>
      )}

      {/* Grid of report cards */}
      {filtered.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <FlaskConical className="h-10 w-10 mx-auto text-[color:var(--portal-ink-2)] mb-3" />
          <p className="text-sm text-[color:var(--portal-ink-2)]">لا توجد نتائج مختبر مطابقة.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((r) => {
            const style = CATEGORY_STYLES[r._cat];
            const totalCount = r._parsed.length;
            const abnormalCount = r._parsed.filter((p) => p.flag !== "normal").length;
            return (
              <article
                key={r.id}
                className={`relative rounded-3xl bg-gradient-to-br ${style.bg} ring-1 ${style.ring} p-5 shadow-sm hover:shadow-md transition-all`}
              >
                <header className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-11 w-11 rounded-2xl bg-white grid place-items-center shadow-sm ${style.icon}`}>
                      <FlaskConical className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold leading-tight">{r.title ?? r.test_type ?? "تقرير مختبر"}</h3>
                      <p className="text-xs text-[color:var(--portal-ink-2)] mt-0.5">
                        {r.test_type ?? style.label}
                        {r.report_date ? ` • ${format(parseISO(r.report_date), "PPP", { locale: arLocale })}` : ""}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={r.status} abnormal={abnormalCount} total={totalCount} />
                </header>

                {r._parsed.length > 0 ? (
                  <ul className="space-y-2.5">
                    {r._parsed.slice(0, 5).map((p, i) => (
                      <li key={i}>
                        <button
                          onClick={() => setSelectedForChart(p.name.toLowerCase())}
                          className="w-full text-right"
                        >
                          <ResultRow p={p} />
                        </button>
                      </li>
                    ))}
                    {r._parsed.length > 5 && (
                      <p className="text-xs text-[color:var(--portal-ink-2)] pt-1">
                        +{r._parsed.length - 5} قيمة إضافية
                      </p>
                    )}
                  </ul>
                ) : (
                  <p className="text-sm text-[color:var(--portal-ink-2)] whitespace-pre-line line-clamp-6">
                    {r.summary ?? "لا يوجد ملخص نصي متاح."}
                  </p>
                )}

                <footer className="mt-5 flex items-center gap-2 pt-4 border-t border-white/60">
                  <button
                    disabled={!r.file_path || downloadingId === r.id}
                    onClick={async () => {
                      if (!r.file_path) return;
                      setDownloadingId(r.id);
                      try {
                        const res = await getLabFileUrl({ data: { path: r.file_path } });
                        window.open(res.url, "_blank", "noopener");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "تعذّر تنزيل الملف");
                      } finally {
                        setDownloadingId(null);
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-full h-9 px-4 text-sm font-semibold bg-white/80 hover:bg-[color:var(--portal-surface)] text-[color:var(--portal-ink)] disabled:opacity-50"
                  >
                    {downloadingId === r.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    تنزيل PDF
                  </button>
                  <button
                    onClick={() => setShareOpen(r)}
                    className="inline-flex items-center gap-2 rounded-full h-9 px-4 text-sm font-semibold text-[color:var(--portal-on-primary)]"
                    style={{ background: "var(--portal-gradient)" }}
                  >
                    <Share2 className="h-4 w-4" />
                    مشاركة مع الطبيب
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {/* Tip banner */}
      <div className="rounded-2xl p-4 bg-gradient-to-r from-teal-50 to-teal-50 ring-1 ring-teal-100 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-teal-600 mt-0.5" />
        <p className="text-sm text-[color:var(--portal-ink)]">
          اضغط على أي نتيجة داخل البطاقة لعرض تطورها الزمني في رسم بياني تفاعلي.
        </p>
      </div>

      <ShareDialog
        report={shareOpen}
        onClose={() => setShareOpen(null)}
      />
    </div>
  );
}

/* ------------------------ subcomponents ------------------------ */

function KpiPill({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" | "neutral" }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : tone === "warn"
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : "bg-slate-50 text-slate-700 ring-slate-200";
  return (
    <div className={`rounded-2xl px-4 py-2 ring-1 ${cls}`}>
      <div className="text-xs">{label}</div>
      <div className="text-lg font-bold leading-none mt-0.5">{value}</div>
    </div>
  );
}

function CatChip({
  active, onClick, label, count, tone,
}: { active: boolean; onClick: () => void; label: string; count: number; tone?: string }) {
  const style = tone ? CATEGORY_STYLES[tone] : undefined;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 h-9 rounded-full px-3 text-sm font-medium transition-all ring-1 ${
        active
          ? "bg-[color:var(--portal-ink)] text-white ring-transparent"
          : `bg-white/70 text-[color:var(--portal-ink)] ${style?.ring ?? "ring-white/60"} hover:bg-white`
      }`}
    >
      {label}
      <span className={`text-xs ${active ? "opacity-80" : "text-[color:var(--portal-ink-2)]"}`}>{count}</span>
    </button>
  );
}

function StatusBadge({ status, abnormal, total }: { status: string | null; abnormal: number; total: number }) {
  if (total > 0 && abnormal > 0) {
    return (
      <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 border-0">
        {abnormal} خارج النطاق
      </Badge>
    );
  }
  if (total > 0 && abnormal === 0) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">
        <Check className="h-3 w-3 mr-1" /> طبيعية
      </Badge>
    );
  }
  return (
    <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 border-0">
      {status ?? "متاح"}
    </Badge>
  );
}

function ResultRow({ p }: { p: ParsedResult }) {
  const range = Math.max(p.high - p.low, 0.0001);
  // extend visual scale ±20% beyond normal range
  const min = p.low - range * 0.4;
  const max = p.high + range * 0.4;
  const pos = Math.min(Math.max(((p.value - min) / (max - min)) * 100, 2), 98);
  const normalStart = ((p.low - min) / (max - min)) * 100;
  const normalWidth = ((p.high - p.low) / (max - min)) * 100;

  const flagColor =
    p.flag === "normal" ? "text-emerald-700" : p.flag === "low" ? "text-amber-700" : "text-rose-700";
  const dotColor =
    p.flag === "normal" ? "bg-emerald-500" : p.flag === "low" ? "bg-amber-500" : "bg-rose-500";

  return (
    <div className="rounded-xl bg-white/70 hover:bg-[color:var(--portal-surface)] transition-colors px-3 py-2 ring-1 ring-white/60">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium truncate">{p.name}</span>
        <span className={`text-sm font-bold tabular-nums inline-flex items-center gap-1 ${flagColor}`}>
          {p.flag === "high" && <ArrowUp className="h-3.5 w-3.5" />}
          {p.flag === "low" && <ArrowDown className="h-3.5 w-3.5" />}
          {p.value}
          {p.unit ? <span className="text-xs font-normal opacity-70">{p.unit}</span> : null}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="absolute inset-y-0 bg-emerald-200/70"
          style={{ right: `${100 - normalStart - normalWidth}%`, width: `${normalWidth}%` }}
        />
        <div
          className={`absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full ring-2 ring-white shadow ${dotColor}`}
          style={{ right: `calc(${pos}% - 7px)` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-[color:var(--portal-ink-2)] mt-1 tabular-nums">
        <span>{p.low}</span>
        <span>النطاق الطبيعي</span>
        <span>{p.high}</span>
      </div>
    </div>
  );
}

/* ------------------------ share dialog ------------------------ */

function ShareDialog({ report, onClose }: { report: LabReport | null; onClose: () => void }) {
  const open = !!report;
  const doctors = useQuery({ ...doctorsQuery, enabled: open });
  const [doctorId, setDoctorId] = useState("");
  const [note, setNote] = useState("");

  const mut = useMutation({
    mutationFn: (v: { report_id: string; doctor_id: string; note?: string }) =>
      shareLabWithDoctor({ data: v }),
    onSuccess: () => {
      toast.success("تمت مشاركة النتيجة مع فريق الطبيب.");
      setDoctorId("");
      setNote("");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذّرت المشاركة"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>مشاركة نتيجة المختبر مع الطبيب</DialogTitle>
        </DialogHeader>
        {report && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 p-3 text-sm">
              <div className="font-semibold">{report.title ?? report.test_type ?? "تقرير مختبر"}</div>
              <div className="text-xs text-slate-500 mt-1">
                {report.report_date
                  ? format(parseISO(report.report_date), "PPP", { locale: arLocale })
                  : "بدون تاريخ"}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">الطبيب</label>
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="mt-1 w-full h-11 rounded-xl border border-slate-200 bg-[color:var(--portal-surface)] px-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--portal-accent)]"
              >
                <option value="">اختر الطبيب…</option>
                {(doctors.data?.doctors ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title_ar ? `${d.title_ar} ` : ""}{d.name_ar}
                    {d.specialty ? ` — ${d.specialty}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">ملاحظة اختيارية</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="مثال: أرغب بمراجعة النتائج قبل الموعد القادم."
                className="mt-1 w-full rounded-xl border border-slate-200 bg-[color:var(--portal-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--portal-accent)]"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <button
            onClick={onClose}
            className="h-10 rounded-full px-4 text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            إلغاء
          </button>
          <button
            disabled={!doctorId || !report || mut.isPending}
            onClick={() =>
              report &&
              mut.mutate({
                report_id: report.id,
                doctor_id: doctorId,
                note: note.trim() || undefined,
              })
            }
            className="h-10 rounded-full px-5 text-sm font-semibold text-[color:var(--portal-on-primary)] inline-flex items-center gap-2 disabled:opacity-50"
            style={{ background: "var(--portal-gradient)" }}
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            مشاركة الآن
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
