/**
 * Phase 5 — /patient/notifications.
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listMyNotifications } from "@/lib/portal/notifications.functions";
import { EmptyState, SkeletonList } from "@/components/states";
import { patientRouteStates } from "@/components/states/patient-route-states";
import { Card, CardContent } from "@/components/ui/card";
import { Bell } from "lucide-react";

const notifsQuery = queryOptions({
  queryKey: ["patient", "notifications"],
  queryFn: () => listMyNotifications({ data: { limit: 50 } }),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/patient/notifications")({
  loader: ({ context }) => context.queryClient.ensureQueryData(notifsQuery),
  head: () => ({
    meta: [
      { title: "الإشعارات | بوابة المريض" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: NotifsPage,
  ...patientRouteStates({ skeleton: "list", rows: 5 }),
});

function NotifsPage() {
  const { data } = useSuspenseQuery(notifsQuery);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = ((data as any)?.items ?? (Array.isArray(data) ? data : [])) as Array<{
    id: string;
    title?: string | null;
    body?: string | null;
    created_at: string;
    read_at?: string | null;
  }>;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الإشعارات</h1>
      {items.length === 0 ? (
        <EmptyState title="لا توجد إشعارات" description="لن تفوّت أي تحديث حالما نرسل واحدًا." />
      ) : (
        items.map((n) => (
          <Card key={n.id} className={n.read_at ? "opacity-70" : ""}>
            <CardContent className="flex items-start gap-3 p-4">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Bell className="h-4 w-4" aria-hidden />
              </div>
              <div className="flex-1">
                <div className="font-medium">{n.title ?? "إشعار"}</div>
                {n.body && <div className="mt-1 text-sm text-muted-foreground">{n.body}</div>}
                <div className="mt-1 text-xs text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("ar-SA")}
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
