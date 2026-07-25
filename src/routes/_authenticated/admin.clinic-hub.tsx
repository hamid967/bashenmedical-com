/**
 * Clinic Hub — unified surface for clinical-operations admin dashboards.
 * Merges Reservations Usage, Doctors, and Branches under one tabbed page.
 * Original routes remain available as deep links.
 */
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { CalendarClock, Stethoscope, Building2 } from "lucide-react";
import { z } from "zod";

import { RequirePermission } from "@/components/rbac/RequirePermission";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui-v3";

import { AdminDoctorsPage } from "./admin.doctors";
import { BranchesList } from "./admin.branches";
import { ReservationsUsagePage } from "./admin.reservations-usage";

const TABS = ["reservations", "doctors", "branches"] as const;
type ClinicTab = (typeof TABS)[number];

const searchSchema = z.object({
  tab: z.enum(TABS).default("reservations"),
});

export const Route = createFileRoute("/_authenticated/admin/clinic-hub")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "المركز السريري — لوحة الإدارة الموحدة" },
      {
        name: "description",
        content: "استخدام الحجوزات، إدارة الأطباء، والفروع في واجهة واحدة داخل لوحة الإدارة.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ClinicHub,
});

function ClinicHub() {
  const { tab } = useSearch({ from: "/_authenticated/admin/clinic-hub" });
  const navigate = Route.useNavigate();

  const setTab = (next: ClinicTab) => {
    navigate({ search: { tab: next }, replace: true });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">المركز السريري</h1>
        <p className="text-sm text-muted-foreground">الحجوزات، الأطباء، والفروع في مكان واحد.</p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ClinicTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="reservations" className="gap-2">
            <CalendarClock className="h-4 w-4" aria-hidden />
            <span>استخدام الحجوزات</span>
          </TabsTrigger>
          <TabsTrigger value="doctors" className="gap-2">
            <Stethoscope className="h-4 w-4" aria-hidden />
            <span>الأطباء</span>
          </TabsTrigger>
          <TabsTrigger value="branches" className="gap-2">
            <Building2 className="h-4 w-4" aria-hidden />
            <span>الفروع</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reservations" className="mt-4">
          {tab === "reservations" && <ReservationsUsagePage />}
        </TabsContent>
        <TabsContent value="doctors" className="mt-4">
          {tab === "doctors" && (
            <RequirePermission anyOf="doctors.manage">
              <AdminDoctorsPage />
            </RequirePermission>
          )}
        </TabsContent>
        <TabsContent value="branches" className="mt-4">
          {tab === "branches" && <BranchesList />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
