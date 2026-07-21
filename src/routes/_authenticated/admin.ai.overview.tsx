import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertConsoleAccess } from "@/lib/admin/_guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Bot, Activity, ShieldAlert, MessagesSquare } from "lucide-react";

interface AiOverview {
  flags: { key: string; enabled: boolean; notes: string | null }[];
  routes: { route_name: string; model_id: string; enabled: boolean; fallback_id: string | null }[];
  conversations_24h: number;
  messages_24h: number;
  safety_incidents_24h: {
    kind: string;
    severity: string;
    count: number;
  }[];
  latest_incidents: {
    id: string;
    kind: string;
    severity: string;
    created_at: string;
    action_taken: string | null;
  }[];
}

const getAiOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiOverview> => {
    await assertConsoleAccess(context);
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [flags, routes, convCount, msgCount, incidents, latest] = await Promise.all([
      context.supabase.from("ai_feature_flags").select("key, enabled, notes").order("key"),
      context.supabase.from("ai_model_routes").select("route_name, model_id, enabled, fallback_id").order("route_name"),
      context.supabase.from("ai_conversations").select("id", { count: "exact", head: true }).gte("started_at", since),
      context.supabase.from("ai_messages").select("id", { count: "exact", head: true }).gte("created_at", since),
      context.supabase.from("ai_safety_incidents").select("kind, severity").gte("created_at", since),
      context.supabase.from("ai_safety_incidents").select("id, kind, severity, created_at, action_taken").order("created_at", { ascending: false }).limit(10),
    ]);
    const bucket = new Map<string, { kind: string; severity: string; count: number }>();
    for (const row of incidents.data ?? []) {
      const k = `${row.kind}|${row.severity}`;
      const cur = bucket.get(k) ?? { kind: row.kind, severity: row.severity, count: 0 };
      cur.count += 1;
      bucket.set(k, cur);
    }
    return {
      flags: flags.data ?? [],
      routes: routes.data ?? [],
      conversations_24h: convCount.count ?? 0,
      messages_24h: msgCount.count ?? 0,
      safety_incidents_24h: Array.from(bucket.values()).sort((a, b) => b.count - a.count),
      latest_incidents: latest.data ?? [],
    };
  });

export const Route = createFileRoute("/_authenticated/admin/ai/overview")({
  component: AiOverviewPage,
});

function AiOverviewPage() {
  const q = useQuery({ queryKey: ["ai-overview"], queryFn: () => getAiOverview() });

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">جاري التحميل...</div>;
  if (q.error) return (
    <div className="p-6 text-sm text-destructive flex items-center gap-2">
      <AlertCircle className="h-4 w-4" /> تعذّر تحميل نظرة عامة على المساعد الذكي.
    </div>
  );
  const d = q.data!;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">مساعد باعشن الذكي — نظرة عامة</h1>
          <p className="text-xs text-muted-foreground">آخر 24 ساعة</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard icon={<MessagesSquare className="h-4 w-4" />} label="المحادثات" value={d.conversations_24h} />
        <KpiCard icon={<Activity className="h-4 w-4" />} label="الرسائل" value={d.messages_24h} />
        <KpiCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label="حوادث أمان"
          value={d.safety_incidents_24h.reduce((s, r) => s + r.count, 0)}
          tone={d.safety_incidents_24h.some((i) => i.severity === "critical" || i.severity === "high") ? "danger" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">مفاتيح التفعيل</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {d.flags.length === 0 && <p className="text-muted-foreground">لا توجد مفاتيح.</p>}
            {d.flags.map((f) => (
              <div key={f.key} className="flex items-start justify-between gap-3 rounded border p-2">
                <div>
                  <div className="font-mono text-xs">{f.key}</div>
                  {f.notes && <p className="mt-0.5 text-xs text-muted-foreground">{f.notes}</p>}
                </div>
                <Badge variant={f.enabled ? "default" : "secondary"}>
                  {f.enabled ? "مفعّل" : "معطّل"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">نماذج قيد الاستخدام</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {d.routes.map((r) => (
              <div key={r.route_name} className="flex items-center justify-between rounded border p-2">
                <div>
                  <div className="text-xs font-semibold">{r.route_name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{r.model_id}</div>
                  {r.fallback_id && (
                    <div className="font-mono text-[11px] text-muted-foreground">احتياطي: {r.fallback_id}</div>
                  )}
                </div>
                <Badge variant={r.enabled ? "default" : "secondary"}>{r.enabled ? "نشط" : "معطّل"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">أنواع حوادث الأمان (24 ساعة)</CardTitle></CardHeader>
        <CardContent>
          {d.safety_incidents_24h.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا حوادث في آخر 24 ساعة.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr><th className="p-2 text-start">النوع</th><th className="p-2 text-start">الخطورة</th><th className="p-2 text-end">العدد</th></tr>
                </thead>
                <tbody>
                  {d.safety_incidents_24h.map((r) => (
                    <tr key={`${r.kind}-${r.severity}`} className="border-t">
                      <td className="p-2 font-mono text-xs">{r.kind}</td>
                      <td className="p-2"><SeverityBadge severity={r.severity} /></td>
                      <td className="p-2 text-end">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">أحدث الحوادث</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {d.latest_incidents.length === 0 && <p className="text-sm text-muted-foreground">لا شيء لعرضه.</p>}
          {d.latest_incidents.map((i) => (
            <div key={i.id} className="flex items-start justify-between gap-3 rounded border p-2 text-sm">
              <div>
                <div className="font-mono text-xs">{i.kind}</div>
                {i.action_taken && <p className="text-xs text-muted-foreground">إجراء: {i.action_taken}</p>}
                <p className="text-[11px] text-muted-foreground">{new Date(i.created_at).toLocaleString("ar-SA")}</p>
              </div>
              <SeverityBadge severity={i.severity} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: "danger" | "default" }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`grid h-9 w-9 place-items-center rounded-lg ${tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          {icon}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold">{value.toLocaleString("ar-SA")}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const variant =
    severity === "critical" ? "destructive" :
    severity === "high" ? "destructive" :
    severity === "warn" ? "secondary" : "outline";
  return <Badge variant={variant as "destructive" | "secondary" | "outline"}>{severity}</Badge>;
}
