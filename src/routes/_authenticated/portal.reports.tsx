import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar as arLocale } from "date-fns/locale";
import {
  Download,
  FileText,
  FlaskConical,
  ScanLine,
  Stethoscope,
  ClipboardList,
  ArrowRight,
  Search,
  AlertTriangle,
  Loader2,
  Inbox,
  Info,
  Calendar,
  MapPin,
  User as UserIcon,
  History as HistoryIcon,
} from "lucide-react";
import {
  listMyMedicalReports,
  getMyMedicalReportFileUrl,
  getMyMedicalReportDetail,
  getMyMedicalReportVersionFileUrl,
  type MyMedicalReport,
  type MyMedicalReportDetail,
  type ReportType,
} from "@/lib/portal/reports.functions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DemoBadge } from "@/components/DemoBadge";

const reportsQuery = queryOptions({
  queryKey: ["portal", "medical-reports"],
  queryFn: () => listMyMedicalReports(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/portal/reports")({
  loader: ({ context }) => context.queryClient.ensureQueryData(reportsQuery),
  head: () => ({
    meta: [
      { title: "تقاريري الطبية | بوابة المريض" },
      {
        name: "description",
        content: "استعرض جميع تقاريرك الطبية المنشورة، صنّفها بالنوع، وحمّلها بأمان.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsPage,
  errorComponent: ReportsError,
  pendingComponent: ReportsPending,
  pendingMs: 400,
});

const TYPE_META: Record<
  ReportType,
  { label: string; Icon: typeof FileText; tint: string; bg: string }
> = {
  lab: { label: "المختبر", Icon: FlaskConical, tint: "text-emerald-700", bg: "bg-emerald-50" },
  radiology: { label: "الأشعة", Icon: ScanLine, tint: "text-indigo-700", bg: "bg-indigo-50" },
  visit_summary: {
    label: "ملخص زيارة",
    Icon: Stethoscope,
    tint: "text-sky-700",
    bg: "bg-sky-50",
  },
  discharge: {
    label: "خروج/إخلاء",
    Icon: ClipboardList,
    tint: "text-amber-700",
    bg: "bg-amber-50",
  },
  certificate: { label: "شهادة", Icon: FileText, tint: "text-rose-700", bg: "bg-rose-50" },
  referral: { label: "إحالة", Icon: ArrowRight, tint: "text-fuchsia-700", bg: "bg-fuchsia-50" },
  other: { label: "أخرى", Icon: FileText, tint: "text-slate-700", bg: "bg-slate-100" },
};

const FILTER_ORDER: (ReportType | "all")[] = [
  "all",
  "lab",
  "radiology",
  "visit_summary",
  "discharge",
  "certificate",
  "referral",
  "other",
];

function ReportsPage() {
  const { data: reports } = useSuspenseQuery(reportsQuery);
  const getUrl = useServerFn(getMyMedicalReportFileUrl);
  const [type, setType] = useState<ReportType | "all">("all");
  const [q, setQ] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: reports.length };
    for (const r of reports) c[r.report_type] = (c[r.report_type] ?? 0) + 1;
    return c;
  }, [reports]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return reports.filter((r) => {
      if (type !== "all" && r.report_type !== type) return false;
      if (!needle) return true;
      return (
        (r.title_ar ?? "").toLowerCase().includes(needle) ||
        (r.title_en ?? "").toLowerCase().includes(needle) ||
        (r.summary ?? "").toLowerCase().includes(needle) ||
        (r.doctor_name_ar ?? "").toLowerCase().includes(needle)
      );
    });
  }, [reports, type, q]);

  const onDownload = async (r: MyMedicalReport) => {
    if (!r.file_path) {
      toast.info("لا يوجد ملف مرفق بهذا التقرير.");
      return;
    }
    setDownloading(r.id);
    try {
      const { url } = await getUrl({ data: { id: r.id } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر تنزيل التقرير.");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="container-app py-8 space-y-6" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-2">
            <FileText className="h-3.5 w-3.5" />
            بوابة المريض
          </div>
          <h1 className="text-3xl font-bold tracking-tight">تقاريري الطبية</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            جميع تقاريرك المنشورة في مكان واحد — صنّف حسب النوع أو ابحث بالاسم وحمّلها بأمان.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{reports.length} تقرير</Badge>
          <Link
            to="/portal/records"
            className="text-xs text-primary hover:underline self-center"
          >
            عرض السجل الزمني الكامل
          </Link>
        </div>
      </header>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث بالعنوان أو الطبيب أو الملخص…"
            className="pr-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTER_ORDER.map((k) => {
            const active = type === k;
            const label = k === "all" ? "الكل" : TYPE_META[k].label;
            const c = counts[k] ?? 0;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setType(k)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/40"
                }`}
              >
                {label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    active ? "bg-primary-foreground/20" : "bg-muted"
                  }`}
                >
                  {c}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <EmptyState hasReports={reports.length > 0} onReset={() => { setType("all"); setQ(""); }} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {filtered.map((r) => {
            const meta = TYPE_META[r.report_type] ?? TYPE_META.other;
            const Icon = meta.Icon;
            return (
              <li
                key={r.id}
                className="rounded-2xl border border-border bg-card p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${meta.bg} ${meta.tint}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`${meta.tint} ${meta.bg} border-0 text-[11px]`}>
                        {meta.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {r.published_at
                          ? format(new Date(r.published_at), "d MMMM yyyy", { locale: arLocale })
                          : "—"}
                      </span>
                      <DemoBadge show={r.is_demo || /\(DEMO\)/i.test(r.title_ar ?? "")} />
                    </div>
                    <h3 className="font-bold mt-1.5 break-words">
                      {r.title_ar ?? r.title_en ?? "تقرير طبي"}
                    </h3>
                    {r.doctor_name_ar && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        الطبيب: {r.doctor_name_ar}
                      </p>
                    )}
                    {r.summary && (
                      <p className="text-sm mt-2 text-foreground/80 leading-relaxed line-clamp-3 whitespace-pre-line">
                        {r.summary}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={r.file_path ? "default" : "outline"}
                        disabled={!r.file_path || downloading === r.id}
                        onClick={() => onDownload(r)}
                      >
                        {downloading === r.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        <span className="ms-2">
                          {r.file_path ? "تنزيل PDF" : "لا يوجد ملف"}
                        </span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDetailId(r.id)}
                      >
                        <Info className="h-4 w-4" />
                        <span className="ms-2">التفاصيل</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ReportDetailDialog
        reportId={detailId}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}

function ReportDetailDialog({
  reportId,
  onClose,
}: {
  reportId: string | null;
  onClose: () => void;
}) {
  const getDetail = useServerFn(getMyMedicalReportDetail);
  const getMainUrl = useServerFn(getMyMedicalReportFileUrl);
  const getVersionUrl = useServerFn(getMyMedicalReportVersionFileUrl);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["portal", "medical-report-detail", reportId],
    queryFn: () => getDetail({ data: { id: reportId! } }),
    enabled: !!reportId,
    staleTime: 30_000,
  });

  const meta = data ? TYPE_META[data.report_type] ?? TYPE_META.other : null;

  async function downloadMain(d: MyMedicalReportDetail) {
    if (!d.file_path) {
      toast.info("لا يوجد ملف رئيسي.");
      return;
    }
    setBusy("main");
    try {
      const { url } = await getMainUrl({ data: { id: d.id } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر التنزيل.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadVersion(d: MyMedicalReportDetail, versionNumber: number) {
    setBusy(`v-${versionNumber}`);
    try {
      const { url } = await getVersionUrl({
        data: { report_id: d.id, version_number: versionNumber },
      });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر تنزيل النسخة.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={!!reportId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-xl max-h-[85vh] overflow-y-auto">
        {isLoading && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
            <p className="mt-2">جارٍ تحميل تفاصيل التقرير…</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="py-8 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
            <p className="mt-2 text-sm">{(error as Error).message}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        )}

        {data && meta && !isLoading && !error && (
          <>
            <DialogHeader className="text-right">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className={`${meta.tint} ${meta.bg} border-0 text-[11px]`}
                >
                  {meta.label}
                </Badge>
                <DemoBadge show={data.is_demo} />
                <Badge variant="secondary" className="text-[10px]">
                  {data.status === "published" ? "منشور" : data.status}
                </Badge>
              </div>
              <DialogTitle className="mt-1 text-right">
                {data.title_ar ?? data.title_en ?? "تقرير طبي"}
              </DialogTitle>
              {data.title_en && data.title_ar && (
                <DialogDescription className="text-right" dir="ltr">
                  {data.title_en}
                </DialogDescription>
              )}
            </DialogHeader>

            <div className="space-y-5 text-sm">
              <section className="grid grid-cols-2 gap-3 text-xs">
                <MetaRow
                  Icon={Calendar}
                  label="تاريخ النشر"
                  value={
                    data.published_at
                      ? format(new Date(data.published_at), "d MMMM yyyy — HH:mm", {
                          locale: arLocale,
                        })
                      : "—"
                  }
                />
                <MetaRow
                  Icon={Calendar}
                  label="آخر تحديث"
                  value={format(new Date(data.updated_at), "d MMMM yyyy", { locale: arLocale })}
                />
                <MetaRow
                  Icon={UserIcon}
                  label="الطبيب"
                  value={data.doctor_name_ar ?? "—"}
                />
                <MetaRow
                  Icon={MapPin}
                  label="الفرع"
                  value={data.branch_name_ar ?? "—"}
                />
                {data.appointment_date && (
                  <MetaRow
                    Icon={Calendar}
                    label="تاريخ الزيارة"
                    value={format(new Date(data.appointment_date), "d MMMM yyyy", {
                      locale: arLocale,
                    })}
                  />
                )}
              </section>

              {data.summary && (
                <section>
                  <h4 className="mb-1.5 text-xs font-semibold text-muted-foreground">
                    الوصف
                  </h4>
                  <p className="whitespace-pre-line leading-relaxed text-sm">
                    {data.summary}
                  </p>
                </section>
              )}

              <section>
                <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
                  روابط التحميل
                </h4>
                <div className="rounded-lg border border-border divide-y">
                  <div className="flex items-center justify-between p-2.5">
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-primary" />
                      <span>النسخة الحالية (PDF)</span>
                    </div>
                    <Button
                      size="sm"
                      variant={data.file_path ? "default" : "outline"}
                      disabled={!data.file_path || busy === "main"}
                      onClick={() => downloadMain(data)}
                    >
                      {busy === "main" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      <span className="ms-1.5">
                        {data.file_path ? "تنزيل" : "غير متاح"}
                      </span>
                    </Button>
                  </div>
                </div>
              </section>

              {data.versions.length > 0 && (
                <section>
                  <h4 className="mb-2 text-xs font-semibold text-muted-foreground inline-flex items-center gap-1.5">
                    <HistoryIcon className="h-3.5 w-3.5" />
                    النسخ السابقة ({data.versions.length})
                  </h4>
                  <ul className="rounded-lg border border-border divide-y">
                    {data.versions.map((v) => (
                      <li
                        key={v.version_number}
                        className="flex items-center justify-between gap-2 p-2.5"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium">
                            نسخة #{v.version_number}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {format(new Date(v.changed_at), "d MMMM yyyy — HH:mm", {
                              locale: arLocale,
                            })}
                          </div>
                          {v.summary && (
                            <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {v.summary}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!v.has_file || busy === `v-${v.version_number}`}
                          onClick={() => downloadVersion(data, v.version_number)}
                        >
                          {busy === `v-${v.version_number}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="text-[11px] text-muted-foreground">
                معرّف التقرير:{" "}
                <span className="font-mono">{data.id.slice(0, 8)}…</span>
              </section>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                إغلاق
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MetaRow({
  Icon,
  label,
  value,
}: {
  Icon: typeof FileText;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-sm truncate">{value}</div>
      </div>
    </div>
  );
}


function EmptyState({ hasReports, onReset }: { hasReports: boolean; onReset: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 py-16 text-center">
      <Inbox className="h-10 w-10 mx-auto text-muted-foreground" />
      <h3 className="mt-3 font-semibold">
        {hasReports ? "لا توجد نتائج ضمن هذا التصنيف" : "لا توجد تقارير منشورة بعد"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasReports
          ? "جرّب إزالة الفلاتر أو البحث بكلمة مختلفة."
          : "ستظهر تقاريرك هنا فور نشرها من قِبَل الطاقم الطبي."}
      </p>
      {hasReports && (
        <Button size="sm" variant="outline" className="mt-4" onClick={onReset}>
          إعادة تعيين الفلاتر
        </Button>
      )}
    </div>
  );
}

function ReportsPending() {
  return (
    <div className="container-app py-8" dir="rtl">
      <div className="h-8 w-48 bg-muted rounded animate-pulse" />
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-2xl border border-border bg-card animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function ReportsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container-app py-16 text-center" dir="rtl">
      <AlertTriangle className="h-10 w-10 mx-auto text-destructive" />
      <h2 className="mt-3 text-lg font-semibold">تعذّر تحميل تقاريرك</h2>
      <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
      <Button size="sm" variant="outline" className="mt-4" onClick={reset}>
        إعادة المحاولة
      </Button>
    </div>
  );
}
