/**
 * Phase 5 — /patient/reports — Lab | Radiology | Visits | Certificates | Referrals
 * with in-portal secure preview, signed downloads, and access history.
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  listMyMedicalReports,
  listMyReportDownloads,
} from "@/lib/portal/reports.functions";
import { EmptyState } from "@/components/states";
import { patientRouteStates } from "@/components/states/patient-route-states";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, History } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { ReportViewerDialog } from "@/components/patient/ReportViewerDialog";

const reportsQuery = queryOptions({
  queryKey: ["patient", "reports"],
  queryFn: () => listMyMedicalReports(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/patient/reports")({
  loader: ({ context }) => context.queryClient.ensureQueryData(reportsQuery),
  head: () => ({
    meta: [
      { title: "تقاريري | بوابة المريض" },
      { name: "description", content: "التقارير المختبرية والأشعة والزيارات." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ReportsPage,
  ...patientRouteStates({ skeleton: "list", rows: 5 }),
});

const TYPE_LABEL: Record<string, string> = {
  lab: "مختبر",
  radiology: "أشعة",
  visit: "زيارة",
  visit_summary: "خلاصة زيارة",
  certificate: "شهادة",
  medical_certificate: "شهادة طبية",
  referral: "إحالة",
};

function ReportsPage() {
  const { data } = useSuspenseQuery(reportsQuery);
  const items = (data ?? []).map((r) => ({
    id: r.id,
    title: r.title_ar ?? r.title_en ?? null,
    report_type: r.report_type as string,
    published_at: r.published_at,
  }));
  const [tab, setTab] = useState("all");

  const groups: Record<string, typeof items> = {
    all: items,
    lab: items.filter((r) => r.report_type === "lab"),
    radiology: items.filter((r) => r.report_type === "radiology"),
    visit: items.filter(
      (r) => r.report_type === "visit" || r.report_type === "visit_summary",
    ),
    certificate: items.filter(
      (r) => r.report_type === "certificate" || r.report_type === "medical_certificate",
    ),
    referral: items.filter((r) => r.report_type === "referral"),
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">تقاريري الطبية</h1>
        <AccessHistorySheet />
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="all">الكل ({groups.all.length})</TabsTrigger>
          <TabsTrigger value="lab">مختبر ({groups.lab.length})</TabsTrigger>
          <TabsTrigger value="radiology">أشعة ({groups.radiology.length})</TabsTrigger>
          <TabsTrigger value="visit">زيارات ({groups.visit.length})</TabsTrigger>
          <TabsTrigger value="certificate">شهادات ({groups.certificate.length})</TabsTrigger>
          <TabsTrigger value="referral">إحالات ({groups.referral.length})</TabsTrigger>
        </TabsList>

        {Object.entries(groups).map(([k, list]) => (
          <TabsContent key={k} value={k} className="mt-4 space-y-3">
            {list.length === 0 ? (
              <EmptyState title="لا توجد تقارير" description="لا يوجد ما يعرض في هذا القسم." />
            ) : (
              list.map((r) => (
                <Card key={r.id}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-primary/10 p-2 text-primary">
                        <FileText className="h-5 w-5" aria-hidden />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="font-semibold">
                            {r.title ?? TYPE_LABEL[r.report_type] ?? r.report_type}
                          </div>
                          <Badge variant="outline">
                            {TYPE_LABEL[r.report_type] ?? r.report_type}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {r.published_at
                            ? format(new Date(r.published_at), "d MMMM yyyy", { locale: ar })
                            : ""}
                        </div>
                      </div>
                    </div>
                    <ReportViewerDialog
                      reportId={r.id}
                      title={r.title ?? TYPE_LABEL[r.report_type] ?? "تقرير"}
                    />
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/* -------------------- access history sheet -------------------- */

function AccessHistorySheet() {
  const [open, setOpen] = useState(false);
  const history = useQuery({
    queryKey: ["patient", "reports", "downloads"],
    queryFn: () => listMyReportDownloads({ data: { limit: 100 } }),
    enabled: open,
    staleTime: 30_000,
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          <History className="me-1 h-4 w-4" aria-hidden />
          سجل الوصول
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-full max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>سجل الوصول للتقارير</SheetTitle>
          <SheetDescription>
            يعرض آخر محاولات فتح وتحميل التقارير من حسابك.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {history.isPending && (
            <div className="text-sm text-muted-foreground">جارٍ التحميل…</div>
          )}
          {history.isError && (
            <div className="text-sm text-destructive">
              {(history.error as Error).message || "تعذر تحميل السجل."}
            </div>
          )}
          {history.data && history.data.length === 0 && (
            <EmptyState title="لا توجد عمليات وصول" description="لم يتم فتح أي تقرير بعد." />
          )}
          {history.data?.map((entry) => (
            <div key={entry.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">
                  {entry.report_title_ar ??
                    (entry.report_type ? TYPE_LABEL[entry.report_type] ?? entry.report_type : "تقرير")}
                </div>
                <Badge
                  variant={
                    entry.status === "success"
                      ? "default"
                      : entry.status === "failure"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {entry.status === "success"
                    ? "نجاح"
                    : entry.status === "failure"
                      ? "فشل"
                      : "غير معروف"}
                </Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {format(new Date(entry.created_at), "d MMMM yyyy · HH:mm", { locale: ar })}
                {" · "}
                نسخة: {entry.version}
              </div>
              {entry.reason && (
                <div className="mt-1 text-xs text-muted-foreground">
                  السبب: {entry.reason}
                </div>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
