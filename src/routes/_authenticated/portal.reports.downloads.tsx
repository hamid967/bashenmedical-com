import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ar as arLocale } from "date-fns/locale";
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  HelpCircle,
  History as HistoryIcon,
  Loader2,
  Search,
  Inbox,
  RefreshCw,
} from "lucide-react";
import { listMyReportDownloads, type MyReportDownloadEntry } from "@/lib/portal/reports.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/portal/reports/downloads")({
  head: () => ({
    meta: [
      { title: "سجل تحميلات تقاريري | بوابة المريض" },
      {
        name: "description",
        content: "آخر عمليات تحميل تقاريرك الطبية مع التاريخ والحالة وسبب الفشل إن وُجد.",
      },
    ],
  }),
  component: DownloadsPage,
});

const REPORT_TYPE_LABEL: Record<string, string> = {
  lab: "مختبر",
  radiology: "أشعة",
  visit_summary: "ملخّص زيارة",
  discharge: "خروج",
  certificate: "شهادة",
  referral: "إحالة",
  other: "أخرى",
};

function DownloadsPage() {
  const listFn = useServerFn(listMyReportDownloads);
  const [status, setStatus] = useState<"all" | "success" | "failure">("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const query = useQuery({
    queryKey: ["portal", "report-downloads", { status, q, from, to }],
    queryFn: () =>
      listFn({
        data: {
          status,
          q: q.trim() || undefined,
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
          limit: 200,
        },
      }),
  });

  const rows = query.data ?? [];
  const counts = useMemo(() => {
    return {
      total: rows.length,
      success: rows.filter((r) => r.status === "success").length,
      failure: rows.filter((r) => r.status === "failure").length,
    };
  }, [rows]);

  const activeFilters =
    (status !== "all" ? 1 : 0) + (q.trim() ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0);

  const clearAll = () => {
    setStatus("all");
    setQ("");
    setFrom("");
    setTo("");
  };

  return (
    <div className="container-app py-8 space-y-6" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-2">
            <HistoryIcon className="h-3.5 w-3.5" />
            بوابة المريض
          </div>
          <h1 className="text-3xl font-bold tracking-tight">سجل تحميلات تقاريري</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            آخر عمليات تحميل تقاريرك الطبية — التاريخ، النسخة، الحالة، وسبب الفشل إن وُجد.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/portal/reports">
              <ArrowRight className="h-4 w-4 ml-1" />
              العودة للتقارير
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            <RefreshCw className={`h-4 w-4 ml-1 ${query.isFetching ? "animate-spin" : ""}`} />
            تحديث
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="الإجمالي" value={counts.total} />
        <StatCard label="ناجحة" value={counts.success} tone="success" />
        <StatCard label="فاشلة" value={counts.failure} tone="danger" />
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pr-9"
              placeholder="ابحث بالعنوان أو النوع أو السبب…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger>
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="success">ناجحة</SelectItem>
              <SelectItem value="failure">فاشلة</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="من تاريخ"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="إلى تاريخ"
          />
        </div>
        {activeFilters > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{activeFilters} فلتر نشط</Badge>
            <Button variant="ghost" size="sm" onClick={clearAll}>
              مسح الفلاتر
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card">
        {query.isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin ml-2" />
            جارٍ التحميل…
          </div>
        ) : query.isError ? (
          <div className="p-6 text-sm text-destructive">
            تعذّر جلب السجل. {(query.error as Error)?.message}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Inbox className="h-8 w-8 mb-2" />
            لا توجد عمليات تحميل مطابقة.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-right p-3 font-semibold">التاريخ</th>
                  <th className="text-right p-3 font-semibold">التقرير</th>
                  <th className="text-right p-3 font-semibold">النوع</th>
                  <th className="text-right p-3 font-semibold">النسخة</th>
                  <th className="text-right p-3 font-semibold">الحالة</th>
                  <th className="text-right p-3 font-semibold">السبب</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <DownloadRow key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "danger"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</div>
    </div>
  );
}

function DownloadRow({ row }: { row: MyReportDownloadEntry }) {
  const dt = new Date(row.created_at);
  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="p-3 whitespace-nowrap">
        <div>{format(dt, "yyyy/MM/dd", { locale: arLocale })}</div>
        <div className="text-xs text-muted-foreground">
          {format(dt, "HH:mm", { locale: arLocale })}
        </div>
      </td>
      <td className="p-3">
        {row.report_id ? (
          <Link to="/portal/reports" className="text-primary hover:underline">
            {row.report_title_ar ?? "تقرير طبي"}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="p-3">
        {row.report_type ? (
          <Badge variant="outline">{REPORT_TYPE_LABEL[row.report_type] ?? row.report_type}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="p-3 whitespace-nowrap text-xs">
        {row.version === "current" ? "الحالية" : `النسخة ${row.version}`}
      </td>
      <td className="p-3">
        <StatusBadge status={row.status} />
      </td>
      <td className="p-3 text-xs text-muted-foreground max-w-[240px]">
        {row.reason ?? (row.status === "success" ? "—" : "غير محدد")}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: MyReportDownloadEntry["status"] }) {
  if (status === "success") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
        <CheckCircle2 className="h-3 w-3 ml-1" />
        ناجحة
      </Badge>
    );
  }
  if (status === "failure") {
    return (
      <Badge variant="destructive">
        <XCircle className="h-3 w-3 ml-1" />
        فاشلة
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <HelpCircle className="h-3 w-3 ml-1" />
      غير معروفة
    </Badge>
  );
}
