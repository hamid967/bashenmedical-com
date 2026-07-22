import { createFileRoute, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getMyRadiologyReports,
  getRadiologyFileUrl,
  getRadiologyAiSummary,
  type RadiologyReport,
  type RadiologyAiSummary,
} from "@/lib/portal/radiology.functions";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertTriangle,
  Bone,
  Brain,
  Download,
  Eye,
  Heart,
  Loader2,
  RefreshCw,
  ScanLine,
  Search,
  Sparkles,
  Stethoscope,
  X,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ar as arLocale } from "date-fns/locale";

const reportsQuery = queryOptions({
  queryKey: ["portal", "radiology"],
  queryFn: () => getMyRadiologyReports(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/portal/radiology")({
  loader: async ({ context }) => context.queryClient.ensureQueryData(reportsQuery),
  head: () => ({
    meta: [
      { title: "الأشعة | بوابة المريض" },
      { name: "description", content: "تقارير الأشعة مع عرض وتحميل الملفات وملخص AI." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RadiologyPage,
  errorComponent: RadiologyError,
  notFoundComponent: () => null,
});

function RadiologyError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="glass-card max-w-md mx-auto p-8 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-4">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-bold">تعذّر تحميل تقارير الأشعة</h3>
      <p className="text-sm text-[color:var(--portal-ink-2)] mt-2 break-words">
        {error.message || "خطأ غير متوقع."}
      </p>
      <button
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="mt-5 inline-flex items-center gap-2 rounded-full px-4 h-10 text-sm font-semibold text-[color:var(--portal-on-primary)]"
        style={{ background: "var(--portal-gradient)" }}
      >
        <RefreshCw className="h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  );
}

/* ------------------------ styling helpers ------------------------ */

const MODALITY_STYLES: Record<string, { bg: string; ring: string; icon: string; label: string }> = {
  xray: {
    bg: "from-slate-50 to-slate-100/50",
    ring: "ring-slate-200",
    icon: "text-slate-700",
    label: "أشعة سينية",
  },
  ct: {
    bg: "from-teal-50 to-teal-100/50",
    ring: "ring-teal-200",
    icon: "text-teal-600",
    label: "أشعة مقطعية CT",
  },
  mri: {
    bg: "from-teal-50 to-teal-100/50",
    ring: "ring-teal-200",
    icon: "text-teal-600",
    label: "رنين مغناطيسي MRI",
  },
  us: {
    bg: "from-teal-50 to-teal-100/50",
    ring: "ring-teal-200",
    icon: "text-teal-600",
    label: "موجات فوق صوتية",
  },
  mammo: {
    bg: "from-pink-50 to-pink-100/50",
    ring: "ring-pink-200",
    icon: "text-pink-600",
    label: "ماموغرام",
  },
  pet: {
    bg: "from-amber-50 to-amber-100/50",
    ring: "ring-amber-200",
    icon: "text-amber-600",
    label: "PET",
  },
  other: {
    bg: "from-teal-50 to-teal-100/50",
    ring: "ring-teal-200",
    icon: "text-teal-600",
    label: "أخرى",
  },
};

function modalityKey(r: RadiologyReport): keyof typeof MODALITY_STYLES {
  const m = `${r.modality ?? ""}`.toLowerCase();
  if (/mri|رنين/.test(m)) return "mri";
  if (/ct|مقطع/.test(m)) return "ct";
  if (/us|ultra|صوت/.test(m)) return "us";
  if (/mammo|ثدي/.test(m)) return "mammo";
  if (/pet/.test(m)) return "pet";
  if (/x|xray|سينية|عادية/.test(m)) return "xray";
  return "other";
}

function bodyPartIcon(part: string | null | undefined) {
  const t = `${part ?? ""}`.toLowerCase();
  if (/brain|head|رأس|دماغ/.test(t)) return Brain;
  if (/chest|heart|صدر|قلب/.test(t)) return Heart;
  if (/bone|spine|knee|leg|arm|عظم|فقر|ركبة|ذراع/.test(t)) return Bone;
  return ScanLine;
}

/* ------------------------ page ------------------------ */

function RadiologyPage() {
  const { data } = useSuspenseQuery(reportsQuery);
  const reports = data.reports;

  const [q, setQ] = useState("");
  const [activeMod, setActiveMod] = useState<string>("all");
  const [viewer, setViewer] = useState<{ url: string; report: RadiologyReport } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const enriched = useMemo(() => reports.map((r) => ({ ...r, _mod: modalityKey(r) })), [reports]);

  const modalities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of enriched) counts.set(r._mod, (counts.get(r._mod) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [enriched]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return enriched.filter((r) => {
      if (activeMod !== "all" && r._mod !== activeMod) return false;
      if (!needle) return true;
      return (
        (r.modality ?? "").toLowerCase().includes(needle) ||
        (r.body_part ?? "").toLowerCase().includes(needle) ||
        (r.findings ?? "").toLowerCase().includes(needle)
      );
    });
  }, [enriched, q, activeMod]);

  async function openViewer(r: RadiologyReport) {
    if (!r.file_path) {
      toast.error("لا يوجد ملف مرفق لهذا التقرير.");
      return;
    }
    setLoadingId(r.id);
    try {
      const res = await getRadiologyFileUrl({ data: { path: r.file_path } });
      setViewer({ url: res.url, report: r });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر فتح الملف");
    } finally {
      setLoadingId(null);
    }
  }

  async function downloadFile(r: RadiologyReport) {
    if (!r.file_path) return;
    setDownloadingId(r.id);
    try {
      const res = await getRadiologyFileUrl({ data: { path: r.file_path } });
      const a = document.createElement("a");
      a.href = res.url;
      a.download = r.file_path.split("/").pop() ?? "radiology.pdf";
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر التنزيل");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[color:var(--portal-ink-2)] tracking-wider">
              RADIOLOGY
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mt-1">تقارير الأشعة</h1>
            <p className="text-sm text-[color:var(--portal-ink-2)] mt-1">
              اعرض ونزّل تقارير الأشعة الخاصة بك مع ملخص ذكي لأبرز النتائج.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <KpiPill label="إجمالي التقارير" value={reports.length} tone="neutral" />
            <KpiPill
              label="آخر تقرير"
              value={
                reports[0]?.report_date
                  ? format(parseISO(reports[0].report_date), "d MMM", { locale: arLocale })
                  : "—"
              }
              tone="ok"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--portal-ink-2)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بنوع الأشعة أو العضو أو النتائج…"
              className="w-full h-11 rounded-2xl bg-white/70 pr-10 pl-4 text-sm border border-white/60 outline-none focus:ring-2 focus:ring-[color:var(--portal-accent)]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <ModChip
              active={activeMod === "all"}
              onClick={() => setActiveMod("all")}
              label="الكل"
              count={reports.length}
            />
            {modalities.map(([m, n]) => (
              <ModChip
                key={m}
                active={activeMod === m}
                onClick={() => setActiveMod(m)}
                label={MODALITY_STYLES[m]?.label ?? m}
                count={n}
                tone={m}
              />
            ))}
          </div>
        </div>
      </div>

      {/* AI Summary */}
      <AiSummaryCard />

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <ScanLine className="h-10 w-10 mx-auto text-[color:var(--portal-ink-2)] mb-3" />
          <p className="text-sm text-[color:var(--portal-ink-2)]">لا توجد تقارير أشعة مطابقة.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((r) => {
            const style = MODALITY_STYLES[r._mod];
            const BodyIcon = bodyPartIcon(r.body_part);
            return (
              <article
                key={r.id}
                className={`relative rounded-3xl bg-gradient-to-br ${style.bg} ring-1 ${style.ring} p-5 shadow-sm hover:shadow-md transition-all`}
              >
                <header className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-11 w-11 rounded-2xl bg-white grid place-items-center shadow-sm ${style.icon}`}
                    >
                      <BodyIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold leading-tight">{r.body_part ?? "—"}</h3>
                      <p className="text-xs text-[color:var(--portal-ink-2)] mt-0.5">
                        {r.modality ?? style.label}
                        {r.report_date
                          ? ` • ${format(parseISO(r.report_date), "PPP", { locale: arLocale })}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-white/80 text-[color:var(--portal-ink)] border-0">
                    {r.status ?? "متاح"}
                  </Badge>
                </header>

                <div className="rounded-2xl bg-white/70 ring-1 ring-white/60 p-3 min-h-[92px]">
                  <div className="text-[11px] font-semibold text-[color:var(--portal-ink-2)] mb-1">
                    النتائج
                  </div>
                  <p className="text-sm whitespace-pre-line line-clamp-5">
                    {r.findings ?? "لا يوجد ملخص نصي متاح."}
                  </p>
                </div>

                {r.doctor_name && (
                  <div className="mt-3 text-xs text-[color:var(--portal-ink-2)] inline-flex items-center gap-1">
                    <Stethoscope className="h-3.5 w-3.5" />
                    طالب الفحص: د. {r.doctor_name}
                  </div>
                )}

                <footer className="mt-5 flex items-center gap-2 pt-4 border-t border-white/60">
                  <button
                    disabled={!r.file_path || loadingId === r.id}
                    onClick={() => openViewer(r)}
                    className="inline-flex items-center gap-2 rounded-full h-9 px-4 text-sm font-semibold text-[color:var(--portal-on-primary)] disabled:opacity-50"
                    style={{ background: "var(--portal-gradient)" }}
                  >
                    {loadingId === r.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    عرض
                  </button>
                  <button
                    disabled={!r.file_path || downloadingId === r.id}
                    onClick={() => downloadFile(r)}
                    className="inline-flex items-center gap-2 rounded-full h-9 px-4 text-sm font-semibold bg-white/80 hover:bg-[color:var(--portal-surface)] text-[color:var(--portal-ink)] disabled:opacity-50"
                  >
                    {downloadingId === r.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    تنزيل
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {/* Viewer dialog */}
      <Dialog open={!!viewer} onOpenChange={(v) => !v && setViewer(null)}>
        <DialogContent className="sm:max-w-5xl h-[85vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-[color:var(--portal-accent)]" />
              {viewer?.report.modality ?? "أشعة"} — {viewer?.report.body_part ?? ""}
            </DialogTitle>
          </DialogHeader>
          {viewer && (
            <div className="h-full bg-slate-900">
              <iframe src={viewer.url} className="w-full h-full" title="Radiology viewer" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------ subcomponents ------------------------ */

function KpiPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "ok" | "warn" | "neutral";
}) {
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

function ModChip({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: string;
}) {
  const style = tone ? MODALITY_STYLES[tone] : undefined;
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
      <span className={`text-xs ${active ? "opacity-80" : "text-[color:var(--portal-ink-2)]"}`}>
        {count}
      </span>
    </button>
  );
}

function AiSummaryCard() {
  const mut = useMutation({
    mutationFn: () => getRadiologyAiSummary(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذّر توليد الملخص"),
  });
  const summary = mut.data as RadiologyAiSummary | undefined;

  return (
    <div
      className="rounded-3xl p-5 md:p-6 text-[color:var(--portal-on-primary)] shadow-lg relative overflow-hidden"
      style={{ background: "var(--portal-gradient)" }}
    >
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{ background: "radial-gradient(circle at 20% 20%, white, transparent 40%)" }}
      />
      <div className="relative flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-2xl bg-white/20 grid place-items-center backdrop-blur">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs opacity-80 tracking-wider">AI SUMMARY</div>
            <h3 className="text-lg md:text-xl font-bold mt-0.5">
              {summary?.headline ?? "ملخص ذكي لتقارير الأشعة"}
            </h3>
            <p className="text-sm opacity-90 mt-1 max-w-2xl">
              نظرة موجزة وواضحة على أبرز نتائج تقارير الأشعة الحديثة، مع نقاط للمتابعة مع طبيبك.
            </p>
          </div>
        </div>
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="shrink-0 inline-flex items-center gap-2 rounded-full h-10 px-4 text-sm font-semibold bg-white/20 hover:bg-white/30 backdrop-blur disabled:opacity-60"
        >
          {mut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {summary ? "تحديث" : "توليد الملخص"}
        </button>
      </div>

      {summary && (
        <div className="relative mt-5 grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white/10 backdrop-blur p-4">
            <div className="text-xs font-semibold opacity-80 mb-2">أبرز النقاط</div>
            <ul className="space-y-1.5 text-sm">
              {summary.highlights.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <span className="opacity-70">•</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-white/10 backdrop-blur p-4">
            <div className="text-xs font-semibold opacity-80 mb-2">للمتابعة</div>
            <ul className="space-y-2 text-sm">
              {summary.followUps.map((f, i) => (
                <li key={i}>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        f.priority === "high"
                          ? "bg-rose-300"
                          : f.priority === "medium"
                            ? "bg-amber-300"
                            : "bg-emerald-300"
                      }`}
                    />
                    <span className="font-semibold">{f.title}</span>
                  </div>
                  <p className="opacity-90 text-xs mt-0.5 mr-3.5">{f.detail}</p>
                </li>
              ))}
              {summary.followUps.length === 0 && (
                <li className="opacity-80 text-xs">لا توجد نقاط متابعة عاجلة.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
