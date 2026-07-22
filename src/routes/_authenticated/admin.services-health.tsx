/**
 * /admin/services-health — Latest status per internal service surface,
 * plus the most recent error message when available.
 */
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import type React from "react";
import { Suspense } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, HelpCircle, RefreshCw, XCircle } from "lucide-react";
import { getServicesHealth, type ServiceHealth, type ServiceHealthStatus } from "@/lib/admin/services-health.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const healthQuery = (fn: () => Promise<{ services: ServiceHealth[]; generated_at: string }>) =>
  queryOptions({
    queryKey: ["admin", "services-health"],
    queryFn: fn,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

export const Route = createFileRoute("/_authenticated/admin/services-health")({
  head: () => ({
    meta: [
      { title: "حالة الخدمات — Baeshen Admin" },
      { name: "description", content: "لوحة تعرض آخر حالة لكل خدمة داخلية وتفاصيل آخر خطأ." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ServicesHealthPage,
});

function ServicesHealthPage() {
  return (
    <div className="container mx-auto max-w-6xl p-4 md:p-6 space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">حالة الخدمات</h1>
          <p className="text-sm text-muted-foreground">
            آخر حالة لكل خدمة داخلية خلال آخر ساعة، مع تفاصيل آخر خطأ إن وُجد.
          </p>
        </div>
      </header>
      <Suspense fallback={<GridSkeleton />}>
        <HealthGrid />
      </Suspense>
    </div>
  );
}

function HealthGrid() {
  const router = useRouter();
  const fn = useServerFn(getServicesHealth);
  const { data, refetch, isFetching } = useSuspenseQuery(healthQuery(fn));

  const summary = data.services.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<ServiceHealthStatus, number>,
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusPill status="ok" count={summary.ok ?? 0} />
        <StatusPill status="degraded" count={summary.degraded ?? 0} />
        <StatusPill status="down" count={summary.down ?? 0} />
        <StatusPill status="idle" count={summary.idle ?? 0} />
        <StatusPill status="unknown" count={summary.unknown ?? 0} />
        <div className="ms-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            آخر تحديث: {new Date(data.generated_at).toLocaleTimeString()}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              refetch();
              router.invalidate();
            }}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 me-1 ${isFetching ? "animate-spin" : ""}`} />
            تحديث
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.services.map((s) => (
          <ServiceCard key={s.key} service={s} />
        ))}
      </div>
    </>
  );
}

function ServiceCard({ service }: { service: ServiceHealth }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="truncate">{service.label}</span>
          <StatusBadge status={service.status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>نجاح/ساعة: <b className="text-foreground">{service.success_1h}</b></span>
          <span>أخطاء/ساعة: <b className="text-foreground">{service.error_1h}</b></span>
        </div>
        <div className="text-xs text-muted-foreground">
          آخر حدث: {service.last_event_at ? new Date(service.last_event_at).toLocaleString() : "—"}
        </div>
        {service.last_error_message ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
            <div className="flex items-center gap-1 font-medium text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              آخر خطأ
              {service.last_error_at ? (
                <span className="ms-auto text-[10px] text-muted-foreground">
                  {new Date(service.last_error_at).toLocaleString()}
                </span>
              ) : null}
            </div>
            <p className="mt-1 break-words text-foreground/90 line-clamp-4">
              {service.last_error_message}
            </p>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">لا توجد أخطاء حديثة.</div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: ServiceHealthStatus }) {
  const map: Record<ServiceHealthStatus, { label: string; icon: React.ReactNode; cls: string }> = {
    ok: { label: "سليم", icon: <CheckCircle2 className="h-3.5 w-3.5" />, cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
    degraded: { label: "متدهور", icon: <AlertTriangle className="h-3.5 w-3.5" />, cls: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
    down: { label: "متعطّل", icon: <XCircle className="h-3.5 w-3.5" />, cls: "bg-destructive/10 text-destructive border-destructive/30" },
    idle: { label: "خامل", icon: <CircleDashed className="h-3.5 w-3.5" />, cls: "bg-muted text-muted-foreground border-border" },
    unknown: { label: "غير معروف", icon: <HelpCircle className="h-3.5 w-3.5" />, cls: "bg-muted text-muted-foreground border-border" },
  };
  const m = map[status];
  return (
    <Badge variant="outline" className={`gap-1 ${m.cls}`}>
      {m.icon}
      {m.label}
    </Badge>
  );
}

function StatusPill({ status, count }: { status: ServiceHealthStatus; count: number }) {
  return (
    <div className="flex items-center gap-1">
      <StatusBadge status={status} />
      <span className="text-xs text-muted-foreground">{count}</span>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full" />
      ))}
    </div>
  );
}
