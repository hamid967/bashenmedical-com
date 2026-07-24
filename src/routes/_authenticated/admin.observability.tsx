/**
 * Observability Hub — unified surface for admin monitoring dashboards.
 * Merges Web Vitals, AI Streaming, Realtime Monitor, and Visual Analytics
 * under a single tabbed page. Original routes remain available as deep
 * links so existing bookmarks keep working.
 */
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { Activity, AlertOctagon, Gauge, LineChart, Sparkles, Target } from "lucide-react";
import { z } from "zod";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui-v3";
import { SloPanel } from "@/components/admin/observability/SloPanel";
import { ErrorsPanel } from "@/components/admin/observability/ErrorsPanel";

import { AiStreamingMonitor } from "./admin.ai-streaming";
import { RealtimeMonitorPage } from "./admin.realtime-monitor";
import { VisualAnalyticsPage } from "./admin.visual-analytics";
import { WebVitalsPage } from "./admin.web-vitals";

const TABS = ["slo", "errors", "web-vitals", "ai-streaming", "realtime", "visual"] as const;
type ObservabilityTab = (typeof TABS)[number];

const searchSchema = z.object({
  tab: z.enum(TABS).default("slo"),
});

export const Route = createFileRoute("/_authenticated/admin/observability")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Observability Hub — لوحة المراقبة الموحدة" },
      {
        name: "description",
        content:
          "لوحة موحدة لمراقبة أداء الموقع، بث الذكاء الاصطناعي، الأحداث الحيّة، والتحليلات البصرية.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ObservabilityHub,
});

function ObservabilityHub() {
  const { tab } = useSearch({ from: "/_authenticated/admin/observability" });
  const navigate = Route.useNavigate();

  const setTab = (next: ObservabilityTab) => {
    navigate({ search: { tab: next }, replace: true });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Observability Hub</h1>
        <p className="text-sm text-muted-foreground">
          مراقبة الأداء والذكاء الاصطناعي والحجوزات الحيّة في مكان واحد.
        </p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ObservabilityTab)}>
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
          <TabsTrigger value="slo" className="gap-2">
            <Target className="h-4 w-4" aria-hidden />
            <span>SLO / SLI</span>
          </TabsTrigger>
          <TabsTrigger value="errors" className="gap-2">
            <AlertOctagon className="h-4 w-4" aria-hidden />
            <span>Errors</span>
          </TabsTrigger>
          <TabsTrigger value="web-vitals" className="gap-2">
            <Gauge className="h-4 w-4" aria-hidden />
            <span>Web Vitals</span>
          </TabsTrigger>
          <TabsTrigger value="ai-streaming" className="gap-2">
            <Sparkles className="h-4 w-4" aria-hidden />
            <span>AI Streaming</span>
          </TabsTrigger>
          <TabsTrigger value="realtime" className="gap-2">
            <Activity className="h-4 w-4" aria-hidden />
            <span>Realtime</span>
          </TabsTrigger>
          <TabsTrigger value="visual" className="gap-2">
            <LineChart className="h-4 w-4" aria-hidden />
            <span>تحليلات بصرية</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="slo" className="mt-4">
          {tab === "slo" && <SloPanel />}
        </TabsContent>
        <TabsContent value="errors" className="mt-4">
          {tab === "errors" && <ErrorsPanel />}
        </TabsContent>
        <TabsContent value="web-vitals" className="mt-4">
          {tab === "web-vitals" && <WebVitalsPage />}
        </TabsContent>
        <TabsContent value="ai-streaming" className="mt-4">
          {tab === "ai-streaming" && <AiStreamingMonitor />}
        </TabsContent>
        <TabsContent value="realtime" className="mt-4">
          {tab === "realtime" && <RealtimeMonitorPage />}
        </TabsContent>
        <TabsContent value="visual" className="mt-4">
          {tab === "visual" && <VisualAnalyticsPage />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
