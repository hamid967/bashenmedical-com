/**
 * Phase 5 — /patient/insurance.
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listMyInsuranceVerifications } from "@/lib/portal/insurance.functions";
import { EmptyState, SkeletonList } from "@/components/states";
import { patientRouteStates } from "@/components/states/patient-route-states";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

const insuranceQuery = queryOptions({
  queryKey: ["patient", "insurance"],
  queryFn: () => listMyInsuranceVerifications(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/patient/insurance")({
  loader: ({ context }) => context.queryClient.ensureQueryData(insuranceQuery),
  head: () => ({
    meta: [
      { title: "التأمين | بوابة المريض" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: InsurancePage,
  ...patientRouteStates({ skeleton: "list", rows: 3 }),
});

function InsurancePage() {
  const { data } = useSuspenseQuery(insuranceQuery);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = ((data as any)?.items ?? (Array.isArray(data) ? data : [])) as Array<{
    id: string;
    status: string;
    provider_name?: string | null;
    created_at?: string;
  }>;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">التأمين والموافقات</h1>
        <Button asChild size="sm">
          <a href="/insurance/verify">تحقق جديد</a>
        </Button>
      </header>
      {items.length === 0 ? (
        <EmptyState title="لا توجد تحققات تأمينية" description="ابدأ بتحقق تأميني جديد قبل موعدك." />
      ) : (
        items.map((v) => (
          <Card key={v.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <ShieldCheck className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <div className="font-semibold">{v.provider_name ?? "مقدم التأمين"}</div>
                  <div className="text-xs text-muted-foreground">
                    {v.created_at ? new Date(v.created_at).toLocaleDateString("ar-SA") : ""}
                  </div>
                </div>
              </div>
              <Badge variant="outline">{v.status}</Badge>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
