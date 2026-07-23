/**
 * Phase 5 — /patient/appointments — Upcoming / Pending / Previous / Cancelled
 * with full action toolbar (confirm, reschedule, cancel, digital check-in,
 * directions, add-to-calendar, download confirmation, request follow-up).
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listMyAppointments } from "@/lib/portal/appointments.functions";
import { EmptyState } from "@/components/states";
import { patientRouteStates } from "@/components/states/patient-route-states";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Calendar } from "lucide-react";
import {
  AppointmentActions,
  type AppointmentActionsRow,
} from "@/components/patient/AppointmentActions";

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

const STATUS_LABEL: Record<string, string> = {
  new: "جديد",
  confirmed: "مؤكد",
  pending: "قيد الانتظار",
  waitlist: "قائمة انتظار",
  completed: "منتهي",
  cancelled: "ملغى",
  no_show: "لم يحضر",
};

function AppointmentsPage() {
  const { data } = useSuspenseQuery(appointmentsQuery);
  const items = (data?.items ?? []) as AppointmentActionsRow[];
  const [tab, setTab] = useState("upcoming");

  const now = new Date().toISOString().slice(0, 10);
  const bucket = {
    upcoming: items.filter(
      (a) => a.appointment_date >= now && !["cancelled", "no_show", "completed"].includes(a.status),
    ),
    pending: items.filter((a) => ["pending", "waitlist"].includes(a.status)),
    previous: items.filter(
      (a) => a.appointment_date < now && a.status !== "cancelled",
    ),
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

function AppointmentRow({ apt }: { apt: AppointmentActionsRow }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Calendar className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-semibold">{apt.doctor?.name_ar ?? "طبيب"}</div>
              <Badge variant="outline">{STATUS_LABEL[apt.status] ?? apt.status}</Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              {format(new Date(apt.appointment_date), "EEEE d MMMM yyyy", { locale: ar })}
              {apt.appointment_time ? ` · ${apt.appointment_time.slice(0, 5)}` : ""}
            </div>
            <div className="text-xs text-muted-foreground">
              {apt.branch?.name_ar ?? ""}
              {apt.reference_number ? ` · ${apt.reference_number}` : ""}
            </div>
          </div>
        </div>

        <AppointmentActions apt={apt} />
      </CardContent>
    </Card>
  );
}
