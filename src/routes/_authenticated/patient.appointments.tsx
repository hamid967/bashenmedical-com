/**
 * Phase 5 — /patient/appointments — Upcoming / Pending / Previous / Cancelled.
 * Reuses existing portal server functions.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listMyAppointments } from "@/lib/portal/appointments.functions";
import { EmptyState, SkeletonList } from "@/components/states";
import { patientRouteStates } from "@/components/states/patient-route-states";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Calendar, MapPin, Download, RefreshCw, XCircle, CheckCircle2, ArrowLeft } from "lucide-react";

const appointmentsQuery = queryOptions({
  queryKey: ["patient", "appointments"],
  queryFn: () => listMyAppointments({ data: { limit: 100 } }),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/patient/appointments")({
  loader: ({ context }) => context.queryClient.ensureQueryData(appointmentsQuery),
  head: () => ({
    meta: [
      { title: "مواعيدي | بوابة المريض" },
      { name: "description", content: "إدارة مواعيدك الطبية." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AppointmentsPage,
  ...patientRouteStates({ skeleton: "list", rows: 6 }),
});

function AppointmentsPage() {
  const { data } = useSuspenseQuery(appointmentsQuery);
  const items = data?.items ?? [];
  const [tab, setTab] = useState("upcoming");

  const now = new Date().toISOString().slice(0, 10);
  const bucket = {
    upcoming: items.filter((a) => a.appointment_date >= now && !["cancelled", "no_show"].includes(a.status)),
    pending: items.filter((a) => ["pending", "waitlist"].includes(a.status)),
    previous: items.filter((a) => a.appointment_date < now && a.status !== "cancelled"),
    cancelled: items.filter((a) => a.status === "cancelled"),
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">مواعيدي</h1>
        <Button asChild size="sm">
          <Link to="/book">حجز جديد</Link>
        </Button>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="upcoming">القادمة ({bucket.upcoming.length})</TabsTrigger>
          <TabsTrigger value="pending">قيد الانتظار ({bucket.pending.length})</TabsTrigger>
          <TabsTrigger value="previous">السابقة ({bucket.previous.length})</TabsTrigger>
          <TabsTrigger value="cancelled">الملغاة ({bucket.cancelled.length})</TabsTrigger>
        </TabsList>

        {(["upcoming", "pending", "previous", "cancelled"] as const).map((key) => (
          <TabsContent key={key} value={key} className="mt-4 space-y-3">
            {bucket[key].length === 0 ? (
              <EmptyState title="لا توجد مواعيد" description="لا يوجد ما يعرض في هذا القسم." />
            ) : (
              bucket[key].map((a) => <AppointmentRow key={a.id} apt={a} />)
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function AppointmentRow({ apt }: { apt: Awaited<ReturnType<typeof listMyAppointments>>["items"][number] }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Calendar className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <div className="font-semibold">{apt.doctor?.name_ar ?? "طبيب"}</div>
            <div className="text-sm text-muted-foreground">
              {format(new Date(apt.appointment_date), "EEEE d MMMM yyyy", { locale: ar })}
              {apt.appointment_time ? ` · ${apt.appointment_time.slice(0, 5)}` : ""}
            </div>
            <div className="text-xs text-muted-foreground">
              {apt.branch?.name_ar ?? ""} {apt.reference_number ? `· ${apt.reference_number}` : ""}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{apt.status}</Badge>
          <Button size="sm" variant="outline" asChild>
            <a
              href={
                apt.branch?.latitude && apt.branch?.longitude
                  ? `https://www.google.com/maps/dir/?api=1&destination=${apt.branch.lat},${apt.branch.lng}`
                  : "#"
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPin className="me-1 h-3 w-3" aria-hidden />
              اتجاهات
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={`/portal/orders/appointment/${apt.id}`}>
              التفاصيل
              <ArrowLeft className="ms-1 h-3 w-3" aria-hidden />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
