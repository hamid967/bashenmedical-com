/**
 * Phase 5 — /patient/prescriptions.
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getMyPrescriptions } from "@/lib/portal/prescriptions.functions";
import { ErrorState, EmptyState, SkeletonList } from "@/components/states";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill, ArrowLeft } from "lucide-react";

const rxQuery = queryOptions({
  queryKey: ["patient", "prescriptions"],
  queryFn: () => getMyPrescriptions(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/patient/prescriptions")({
  loader: ({ context }) => context.queryClient.ensureQueryData(rxQuery),
  head: () => ({
    meta: [
      { title: "الوصفات الطبية | بوابة المريض" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RxPage,
  pendingComponent: () => <SkeletonList rows={4} />,
  errorComponent: ({ error, reset }) => <ErrorState description={error.message} onRetry={reset} />,
});

function RxPage() {
  const { data } = useSuspenseQuery(rxQuery);
  const items = data?.active ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">وصفاتي الطبية</h1>
      {items.length === 0 ? (
        <EmptyState title="لا توجد وصفات" description="لم يتم إصدار وصفات لك بعد." />
      ) : (
        items.map((rx) => (
          <Card key={rx.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Pill className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <div className="font-semibold">{rx.medication ?? "دواء"}</div>
                  <div className="text-xs text-muted-foreground">
                    {rx.dosage ?? ""} {rx.frequency ? `· ${rx.frequency}` : ""}
                  </div>
                </div>
              </div>
              <Button size="sm" variant="outline" asChild>
                <a href="/portal/prescriptions">
                  التفاصيل
                  <ArrowLeft className="ms-1 h-3 w-3" aria-hidden />
                </a>
              </Button>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
