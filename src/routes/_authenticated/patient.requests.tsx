/**
 * Phase 5 — /patient/requests — service inquiries + home care + 2nd opinion.
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listMyInquiries } from "@/lib/portal/inquiries.functions";
import { EmptyState, SkeletonList } from "@/components/states";
import { patientRouteStates } from "@/components/states/patient-route-states";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, ArrowLeft } from "lucide-react";

const inquiriesQuery = queryOptions({
  queryKey: ["patient", "requests"],
  queryFn: () => listMyInquiries(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/patient/requests")({
  loader: ({ context }) => context.queryClient.ensureQueryData(inquiriesQuery),
  head: () => ({
    meta: [
      { title: "طلباتي واستفساراتي | بوابة المريض" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RequestsPage,
  ...patientRouteStates({ skeleton: "list", rows: 3 }),
});

function RequestsPage() {
  const { data } = useSuspenseQuery(inquiriesQuery);
  const items = data ?? [];
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">طلباتي واستفساراتي</h1>
        <Button asChild size="sm">
          <a href="/services">استكشف الخدمات</a>
        </Button>
      </header>
      {items.length === 0 ? (
        <EmptyState
          title="لا توجد طلبات"
          description="لم تسجل أي طلبات أو استفسارات بعد."
        />
      ) : (
        items.map((it) => (
          <Card key={it.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <MessageSquare className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <div className="font-semibold">{it.service_label ?? "طلب"}</div>
                  <div className="text-xs text-muted-foreground">
                    {it.request_number}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{it.internal_status}</Badge>
                <Button size="sm" variant="outline" asChild>
                  <a href="/portal/inquiries">
                    التفاصيل
                    <ArrowLeft className="ms-1 h-3 w-3" aria-hidden />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
