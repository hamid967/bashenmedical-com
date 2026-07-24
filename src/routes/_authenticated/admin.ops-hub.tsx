/**
 * Operations Hub — unified surface for daily-operations admin dashboards.
 * Merges Unified Inbox, SLA dashboard, and Audit Logs under one tabbed page.
 * Original routes remain available as deep links for existing bookmarks.
 */
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { Inbox, AlarmClock, ScrollText } from "lucide-react";
import { z } from "zod";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui-v3";

import { AuditLogsPage } from "./admin.audit-logs";
import { SlaPage } from "./admin.inbox.sla";
import { UnifiedInboxPage } from "./admin.inbox";

const TABS = ["inbox", "sla", "audit"] as const;
type OpsTab = (typeof TABS)[number];

const searchSchema = z.object({
  tab: z.enum(TABS).default("inbox"),
});

export const Route = createFileRoute("/_authenticated/admin/ops-hub")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "مركز العمليات — لوحة الإدارة الموحدة" },
      {
        name: "description",
        content:
          "مركز موحّد للصندوق الوارد، تنبيهات SLA، وسجل التدقيق داخل لوحة الإدارة.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: OpsHub,
});

function OpsHub() {
  const { tab } = useSearch({ from: "/_authenticated/admin/ops-hub" });
  const navigate = Route.useNavigate();

  const setTab = (next: OpsTab) => {
    navigate({ search: { tab: next }, replace: true });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">مركز العمليات</h1>
        <p className="text-sm text-muted-foreground">
          الصندوق الموحد، مراقبة SLA، وسجل التدقيق في واجهة واحدة.
        </p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as OpsTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="inbox" className="gap-2">
            <Inbox className="h-4 w-4" aria-hidden />
            <span>الصندوق الموحد</span>
          </TabsTrigger>
          <TabsTrigger value="sla" className="gap-2">
            <AlarmClock className="h-4 w-4" aria-hidden />
            <span>SLA</span>
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <ScrollText className="h-4 w-4" aria-hidden />
            <span>سجل التدقيق</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-4">
          {tab === "inbox" && <UnifiedInboxPage />}
        </TabsContent>
        <TabsContent value="sla" className="mt-4">
          {tab === "sla" && <SlaPage />}
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          {tab === "audit" && <AuditLogsPage />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
