/**
 * Phase 5 — /patient/family — dependents + active-profile switching.
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listDependents } from "@/lib/portal/dependents.functions";
import { EmptyState, SkeletonList } from "@/components/states";
import { patientRouteStates } from "@/components/states/patient-route-states";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, UserPlus, ArrowLeft } from "lucide-react";

const dependentsQuery = queryOptions({
  queryKey: ["patient", "family"],
  queryFn: () => listDependents(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/patient/family")({
  loader: ({ context }) => context.queryClient.ensureQueryData(dependentsQuery),
  head: () => ({
    meta: [
      { title: "أفراد الأسرة | بوابة المريض" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FamilyPage,
  ...patientRouteStates({ skeleton: "list", rows: 3 }),
});

function FamilyPage() {
  const { data } = useSuspenseQuery(dependentsQuery);
  const items = (data ?? []) as Array<{
    id: string;
    full_name: string;
    relationship?: string | null;
    verified?: boolean;
  }>;
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">أفراد الأسرة</h1>
        <Button asChild size="sm">
          <a href="/portal/family?new=1">
            <UserPlus className="me-1 h-4 w-4" aria-hidden />
            إضافة تابع
          </a>
        </Button>
      </header>
      {items.length === 0 ? (
        <EmptyState
          title="لا يوجد أفراد أسرة مضافون"
          description="أضف أحد أفراد أسرتك لإدارة مواعيده وحجوزاته."
        />
      ) : (
        items.map((d) => (
          <Card key={d.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Users className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <div className="font-semibold">{d.full_name}</div>
                  <div className="text-xs text-muted-foreground">{d.relationship ?? ""}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={d.verified ? "default" : "outline"}>
                  {d.verified ? "موثّق" : "قيد التحقق"}
                </Badge>
                <Button size="sm" variant="outline" asChild>
                  <a href={`/portal/family?dependent=${d.id}`}>
                    إدارة
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
