/**
 * Phase 5 — /patient/reports — Lab | Radiology | Visits | Certificates | Referrals.
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listMyMedicalReports } from "@/lib/portal/reports.functions";
import { EmptyState, SkeletonList } from "@/components/states";
import { patientRouteStates } from "@/components/states/patient-route-states";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

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
    visit: items.filter((r) => r.report_type === "visit" || r.report_type === "visit_summary"),
    certificate: items.filter((r) => r.report_type === "certificate" || r.report_type === "medical_certificate"),
    referral: items.filter((r) => r.report_type === "referral"),
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">تقاريري الطبية</h1>
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
                        <div className="font-semibold">{r.title ?? r.report_type}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.published_at
                            ? format(new Date(r.published_at), "d MMMM yyyy", { locale: ar })
                            : ""}
                        </div>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" asChild>
                      <a href={`/portal/reports?report=${r.id}`}>
                        <ExternalLink className="me-1 h-3 w-3" aria-hidden />
                        فتح آمن
                      </a>
                    </Button>
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
