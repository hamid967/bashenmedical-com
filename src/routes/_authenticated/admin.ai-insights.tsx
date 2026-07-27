/**
 * /admin/ai-insights — G3 Analytics AI console.
 * Three tabs: No-Show predictions, Smart Recommendations, Complaint Classifications.
 */
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  Brain,
  AlertTriangle,
  Lightbulb,
  MessageSquareWarning,
  Check,
  X,
  Link2,
  ShieldAlert,
} from "lucide-react";
import { getMyRoles } from "@/lib/admin.functions";
import {
  listNoShowPredictions,
  listAiRecommendations,
  decideAiRecommendation,
  listClassifiedComplaints,
} from "@/lib/admin/ai-insights.functions";
import { useActiveTenant } from "@/lib/active-tenant";

const searchSchema = z.object({
  organizationId: fallback(z.string(), "").default(""),
  tab: fallback(z.string(), "no-show").default("no-show"),
});

export const Route = createFileRoute("/_authenticated/admin/ai-insights")({
  validateSearch: zodValidator(searchSchema),
  beforeLoad: async () => {
    const res = await getMyRoles();
    const roles = res.roles ?? [];
    if (!roles.includes("admin") && !roles.includes("super_admin")) {
      throw redirect({ to: "/" });
    }
  },
  component: AiInsightsPage,
  errorComponent: ({ error }) => <div className="p-6 text-red-600">خطأ: {error.message}</div>,
});

type Tab = "no-show" | "recs" | "complaints";
const TABS: Tab[] = ["no-show", "recs", "complaints"];

function AiInsightsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/ai-insights" });
  const {
    tenantId: storedTenantId,
    setTenantId,
    activeOrganization,
    organizations,
    isLoading: orgsLoading,
  } = useActiveTenant();

  const urlOrgId = search.organizationId || null;
  const tab: Tab = (TABS as string[]).includes(search.tab) ? (search.tab as Tab) : "no-show";

  // Membership check runs only after orgs are loaded — otherwise we'd
  // flash a false "denied" state during initial hydration.
  const isMember = (id: string | null) => !id || organizations.some((o) => o.id === id);
  const urlOrgAllowed = !urlOrgId || (!orgsLoading && isMember(urlOrgId));
  const denied = !!urlOrgId && !orgsLoading && !urlOrgAllowed;

  // Drop a disallowed organizationId from the URL rather than sending a
  // query the server would strip via RLS (returning empty rows with no
  // explanation). Prefer the stored tenant, else "all".
  const effectiveTenantId = urlOrgAllowed ? (urlOrgId ?? storedTenantId) : storedTenantId;
  const effectiveOrg =
    (urlOrgAllowed && urlOrgId && organizations.find((o) => o.id === urlOrgId)) ||
    activeOrganization;

  // Sync URL → stored tenant only if the caller is actually a member.
  useEffect(() => {
    if (urlOrgAllowed && urlOrgId && urlOrgId !== storedTenantId) setTenantId(urlOrgId);
  }, [urlOrgAllowed, urlOrgId, storedTenantId, setTenantId]);

  const setTab = (t: Tab) => navigate({ search: { ...search, tab: t }, replace: true });

  const clearUrlOrg = () => navigate({ search: { ...search, organizationId: "" }, replace: true });

  const switchToOrg = (id: string) =>
    navigate({ search: { ...search, organizationId: id }, replace: true });

  const copyShareLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    if (effectiveTenantId) url.searchParams.set("organizationId", effectiveTenantId);
    else url.searchParams.delete("organizationId");
    try {
      await navigator.clipboard.writeText(url.toString());
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <header className="flex items-center gap-3 flex-wrap">
        <Brain className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">تحليلات الذكاء الاصطناعي</h1>
        {effectiveOrg && (
          <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
            المؤسسة: {effectiveOrg.name}
          </span>
        )}
        <button
          onClick={copyShareLink}
          className="mr-auto inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border hover:bg-muted"
          title="نسخ رابط المشاركة"
        >
          <Link2 className="w-3.5 h-3.5" />
          نسخ رابط المشاركة
        </button>
      </header>

      {denied && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 p-4 space-y-3"
        >
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-red-800 dark:text-red-200">
                لا تملك صلاحية الوصول إلى هذه المؤسسة
              </div>
              <div className="text-sm text-red-700/90 dark:text-red-300/90 mt-0.5">
                الرابط يشير إلى مؤسسة (<code className="font-mono text-xs">{urlOrgId}</code>) لست
                عضواً فيها. نعرض حالياً بيانات مؤسستك الافتراضية.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={clearUrlOrg}
              className="text-xs px-3 py-1.5 rounded border bg-white dark:bg-transparent hover:bg-muted"
            >
              إزالة الفلتر ومتابعة
            </button>
            {organizations.map((o) => (
              <button
                key={o.id}
                onClick={() => switchToOrg(o.id)}
                className="text-xs px-3 py-1.5 rounded border bg-white dark:bg-transparent hover:bg-muted inline-flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" /> التحويل إلى: {o.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className="flex gap-2 border-b">
        <TabBtn
          active={tab === "no-show"}
          onClick={() => setTab("no-show")}
          icon={<AlertTriangle className="w-4 h-4" />}
        >
          خطر عدم الحضور
        </TabBtn>
        <TabBtn
          active={tab === "recs"}
          onClick={() => setTab("recs")}
          icon={<Lightbulb className="w-4 h-4" />}
        >
          التوصيات الذكية
        </TabBtn>
        <TabBtn
          active={tab === "complaints"}
          onClick={() => setTab("complaints")}
          icon={<MessageSquareWarning className="w-4 h-4" />}
        >
          تصنيف الشكاوى
        </TabBtn>
      </nav>
      {tab === "no-show" && <NoShowTab tenantId={effectiveTenantId} />}
      {tab === "recs" && <RecsTab tenantId={effectiveTenantId} />}
      {tab === "complaints" && <ComplaintsTab tenantId={effectiveTenantId} />}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 border-b-2 transition ${
        active
          ? "border-primary text-primary font-semibold"
          : "border-transparent text-muted-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function NoShowTab({ tenantId }: { tenantId: string | null }) {
  const fetch = useServerFn(listNoShowPredictions);
  const { data } = useSuspenseQuery({
    queryKey: ["ai-insights", "no-show", tenantId],
    queryFn: () => fetch({ data: { minRisk: 0.5, limit: 100, organizationId: tenantId } }),
  });
  if (!data.length) return <Empty text="لا توجد مواعيد عالية الخطر حالياً." />;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <Th>الخطر</Th>
            <Th>التاريخ</Th>
            <Th>الوقت</Th>
            <Th>الحالة</Th>
            <Th>العوامل</Th>
            <Th>التوصية</Th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.appointment_id} className="border-t">
              <Td>
                <RiskBadge risk={r.risk} />
              </Td>
              <Td>{r.appointment_date ?? "—"}</Td>
              <Td>{r.appointment_time?.slice(0, 5) ?? "—"}</Td>
              <Td>{r.status ?? "—"}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {r.top_factors.slice(0, 3).map((f) => (
                    <span key={f.key} className="text-xs bg-muted px-2 py-0.5 rounded">
                      {f.note}
                    </span>
                  ))}
                </div>
              </Td>
              <Td>{r.recommendation ?? "—"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecsTab({ tenantId }: { tenantId: string | null }) {
  const qc = useQueryClient();
  const fetch = useServerFn(listAiRecommendations);
  const decide = useServerFn(decideAiRecommendation);
  const { data } = useSuspenseQuery({
    queryKey: ["ai-insights", "recs", tenantId],
    queryFn: () => fetch({ data: { status: "open", limit: 50, organizationId: tenantId } }),
  });
  if (!data.length) return <Empty text="لا توجد توصيات مفتوحة." />;
  const act = async (id: string, decision: "accepted" | "dismissed") => {
    await decide({ data: { id, decision } });
    qc.invalidateQueries({ queryKey: ["ai-insights", "recs"] });
  };
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data.map((r: any) => (
        <div key={r.id} className="border rounded-lg p-4 space-y-2 bg-card">
          <div className="flex items-center gap-2">
            <PriorityBadge priority={r.priority} />
            <span className="text-xs text-muted-foreground">{r.scope}</span>
          </div>
          <p className="font-medium">{r.title}</p>
          {r.payload && Object.keys(r.payload).length > 0 && (
            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
              {JSON.stringify(r.payload, null, 2)}
            </pre>
          )}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => act(r.id, "accepted")}
              className="flex-1 flex items-center justify-center gap-1 text-sm bg-green-600 text-white rounded px-3 py-1.5 hover:bg-green-700"
            >
              <Check className="w-4 h-4" /> قبول
            </button>
            <button
              onClick={() => act(r.id, "dismissed")}
              className="flex-1 flex items-center justify-center gap-1 text-sm bg-muted rounded px-3 py-1.5 hover:bg-muted/80"
            >
              <X className="w-4 h-4" /> رفض
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ComplaintsTab({ tenantId }: { tenantId: string | null }) {
  const fetch = useServerFn(listClassifiedComplaints);
  const { data } = useSuspenseQuery({
    queryKey: ["ai-insights", "complaints", tenantId],
    queryFn: () => fetch({ data: { limit: 100, organizationId: tenantId } }),
  });
  if (!data.length) return <Empty text="لا توجد شكاوى مصنّفة بعد." />;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <Th>المرجع</Th>
            <Th>النوع</Th>
            <Th>الفئة</Th>
            <Th>الحدة</Th>
            <Th>القسم المقترح</Th>
            <Th>وقت التصنيف</Th>
          </tr>
        </thead>
        <tbody>
          {data.map((c: any) => (
            <tr key={c.id} className="border-t">
              <Td>{c.reference}</Td>
              <Td>{c.type}</Td>
              <Td>{c.ai_category ?? "—"}</Td>
              <Td>
                <SeverityBadge sev={c.ai_severity} />
              </Td>
              <Td>{c.ai_suggested_owner ?? "—"}</Td>
              <Td>{c.ai_classified_at?.slice(0, 16).replace("T", " ") ?? "—"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-right px-3 py-2 font-semibold">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2">{children}</td>;
}
function Empty({ text }: { text: string }) {
  return <div className="text-center text-muted-foreground py-12">{text}</div>;
}
function RiskBadge({ risk }: { risk: number }) {
  const pct = Math.round(risk * 100);
  const color = risk >= 0.75 ? "bg-red-600" : risk >= 0.6 ? "bg-orange-500" : "bg-yellow-500";
  return <span className={`text-white text-xs px-2 py-0.5 rounded ${color}`}>{pct}%</span>;
}
function PriorityBadge({ priority }: { priority: string }) {
  const color =
    priority === "high" ? "bg-red-600" : priority === "low" ? "bg-gray-500" : "bg-blue-600";
  return <span className={`text-white text-xs px-2 py-0.5 rounded ${color}`}>{priority}</span>;
}
function SeverityBadge({ sev }: { sev: string | null }) {
  if (!sev) return <>—</>;
  const color =
    sev === "critical"
      ? "bg-red-700"
      : sev === "high"
        ? "bg-orange-600"
        : sev === "low"
          ? "bg-gray-500"
          : "bg-blue-600";
  return <span className={`text-white text-xs px-2 py-0.5 rounded ${color}`}>{sev}</span>;
}
