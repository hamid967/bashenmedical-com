/**
 * Content Hub — unified surface for content-management admin dashboards.
 * Merges CMS, Media Library (files), and Content/Pages under one tabbed page.
 * Original routes remain available as deep links for existing bookmarks.
 */
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { FileText, Image as ImageIcon, LayoutTemplate } from "lucide-react";
import { z } from "zod";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { CmsDashboard } from "./admin.cms";
import { ContentAdminPage } from "./admin.content";
import { FilesList } from "./admin.files";

const TABS = ["cms", "media", "pages"] as const;
type ContentTab = (typeof TABS)[number];

const searchSchema = z.object({
  tab: z.enum(TABS).default("cms"),
});

export const Route = createFileRoute("/_authenticated/admin/content-hub")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "مركز المحتوى — لوحة الإدارة الموحدة" },
      {
        name: "description",
        content:
          "إدارة المحتوى، مكتبة الوسائط، والصفحات في واجهة واحدة داخل لوحة الإدارة.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ContentHub,
});

function ContentHub() {
  const { tab } = useSearch({ from: "/_authenticated/admin/content-hub" });
  const navigate = Route.useNavigate();

  const setTab = (next: ContentTab) => {
    navigate({ search: { tab: next }, replace: true });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">مركز المحتوى</h1>
        <p className="text-sm text-muted-foreground">
          إدارة المحتوى، مكتبة الوسائط، والصفحات في مكان واحد.
        </p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ContentTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="cms" className="gap-2">
            <FileText className="h-4 w-4" aria-hidden />
            <span>CMS</span>
          </TabsTrigger>
          <TabsTrigger value="media" className="gap-2">
            <ImageIcon className="h-4 w-4" aria-hidden />
            <span>مكتبة الوسائط</span>
          </TabsTrigger>
          <TabsTrigger value="pages" className="gap-2">
            <LayoutTemplate className="h-4 w-4" aria-hidden />
            <span>الصفحات</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cms" className="mt-4">
          {tab === "cms" && <CmsDashboard />}
        </TabsContent>
        <TabsContent value="media" className="mt-4">
          {tab === "media" && <FilesList />}
        </TabsContent>
        <TabsContent value="pages" className="mt-4">
          {tab === "pages" && <ContentAdminPage />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
