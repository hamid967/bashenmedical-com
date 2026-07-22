import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertConsoleAccess } from "@/lib/admin/_guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Bot,
  Activity,
  ShieldAlert,
  MessagesSquare,
  Wrench,
  Timer,
  DollarSign,
  PhoneForwarded,
} from "lucide-react";

interface ToolStat {
  tool: string;
  total: number;
  ok: number;
  error: number;
  denied: number;
  timeout: number;
  success_rate: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  cost_usd: number;
}
interface HandoffStat {
  scope: string;
  conversations: number;
  handoffs: number;
  rate: number;
}

interface AiOverview {
  flags: { key: string; enabled: boolean; notes: string | null }[];
  routes: { route_name: string; model_id: string; enabled: boolean; fallback_id: string | null }[];
  conversations_24h: number;
  messages_24h: number;
  avg_response_ms: number;
  p95_response_ms: number;
  total_cost_usd: number;
  safety_incidents_24h: { kind: string; severity: string; count: number }[];
  latest_incidents: {
    id: string;
    kind: string;
    severity: string;
    created_at: string;
    action_taken: string | null;
  }[];
  tool_stats: ToolStat[];
  handoff_by_scope: HandoffStat[];
}

const getAiOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<AiOverview> => {
    await assertConsoleAccess(context);
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const today = new Date().toISOString().slice(0, 10);
    const [
      flags,
      routes,
      convCount,
      msgCount,
      incidents,
      latest,
      tools,
      costs,
      convs,
      handoffIncidents,
    ] = await Promise.all([
      context.supabase.from("ai_feature_flags").select("key, enabled, notes").order("key"),
      context.supabase
        .from("ai_model_routes")
        .select("route_name, model_id, enabled, fallback_id")
        .order("route_name"),
      context.supabase
        .from("ai_conversations")
        .select("id", { count: "exact", head: true })
        .gte("started_at", since),
      context.supabase
        .from("ai_messages")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      context.supabase
        .from("ai_safety_incidents")
        .select("kind, severity")
        .gte("created_at", since),
      context.supabase
        .from("ai_safety_incidents")
        .select("id, kind, severity, created_at, action_taken")
        .order("created_at", { ascending: false })
        .limit(10),
      context.supabase
        .from("ai_tool_invocations")
        .select("tool, status, latency_ms, cost_usd")
        .gte("created_at", since)
        .limit(5000),
      context.supabase.from("ai_usage_costs").select("cost_usd").gte("day", today),
      context.supabase
        .from("ai_conversations")
        .select("id, scope")
        .gte("started_at", since)
        .limit(5000),
      context.supabase
        .from("ai_safety_incidents")
        .select("conversation_id, kind, action_taken, severity")
        .gte("created_at", since)
        .limit(5000),
    ]);

    // Safety bucket
    const bucket = new Map<string, { kind: string; severity: string; count: number }>();
    for (const row of incidents.data ?? []) {
      const k = `${row.kind}|${row.severity}`;
      const cur = bucket.get(k) ?? { kind: row.kind, severity: row.severity, count: 0 };
      cur.count += 1;
      bucket.set(k, cur);
    }

    // Tool stats
    const toolMap = new Map<
      string,
      {
        total: number;
        ok: number;
        error: number;
        denied: number;
        timeout: number;
        latencies: number[];
        cost: number;
      }
    >();
    let toolCostSum = 0;
    for (const t of tools.data ?? []) {
      const e = toolMap.get(t.tool) ?? {
        total: 0,
        ok: 0,
        error: 0,
        denied: 0,
        timeout: 0,
        latencies: [],
        cost: 0,
      };
      e.total += 1;
      if (t.status === "ok") e.ok += 1;
      else if (t.status === "error") e.error += 1;
      else if (t.status === "denied") e.denied += 1;
      else if (t.status === "timeout") e.timeout += 1;
      if (typeof t.latency_ms === "number") e.latencies.push(t.latency_ms);
      const c = Number(t.cost_usd ?? 0);
      e.cost += c;
      toolCostSum += c;
      toolMap.set(t.tool, e);
    }
    const tool_stats: ToolStat[] = Array.from(toolMap.entries())
      .map(([tool, e]) => {
        const sorted = e.latencies.slice().sort((a, b) => a - b);
        const avg = sorted.length ? sorted.reduce((s, n) => s + n, 0) / sorted.length : 0;
        const p95 = sorted.length
          ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
          : 0;
        return {
          tool,
          total: e.total,
          ok: e.ok,
          error: e.error,
          denied: e.denied,
          timeout: e.timeout,
          success_rate: e.total ? e.ok / e.total : 0,
          avg_latency_ms: Math.round(avg),
          p95_latency_ms: Math.round(p95),
          cost_usd: Number(e.cost.toFixed(4)),
        };
      })
      .sort((a, b) => b.total - a.total);

    // Overall response latency (across all tools)
    const allLat = (tools.data ?? [])
      .map((t) => t.latency_ms)
      .filter((n): n is number => typeof n === "number")
      .sort((a, b) => a - b);
    const avg_response_ms = allLat.length
      ? Math.round(allLat.reduce((s, n) => s + n, 0) / allLat.length)
      : 0;
    const p95_response_ms = allLat.length
      ? allLat[Math.min(allLat.length - 1, Math.floor(allLat.length * 0.95))]
      : 0;

    // Cost
    const modelCostSum = (costs.data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
    const total_cost_usd = Number((toolCostSum + modelCostSum).toFixed(4));

    // Handoff by scope
    const scopeById = new Map<string, string>();
    const scopeCount = new Map<string, number>();
    for (const c of convs.data ?? []) {
      scopeById.set(c.id, c.scope);
      scopeCount.set(c.scope, (scopeCount.get(c.scope) ?? 0) + 1);
    }
    const handoffConvs = new Map<string, Set<string>>();
    for (const i of handoffIncidents.data ?? []) {
      const isHandoff =
        (i.kind && /handoff|escalat|whatsapp/i.test(i.kind)) ||
        (i.action_taken && /handoff|whatsapp|escalat/i.test(i.action_taken)) ||
        i.severity === "critical" ||
        i.severity === "high";
      if (!isHandoff || !i.conversation_id) continue;
      const scope = scopeById.get(i.conversation_id);
      if (!scope) continue;
      const set = handoffConvs.get(scope) ?? new Set<string>();
      set.add(i.conversation_id);
      handoffConvs.set(scope, set);
    }
    const handoff_by_scope: HandoffStat[] = Array.from(scopeCount.entries())
      .map(([scope, conversations]) => {
        const handoffs = handoffConvs.get(scope)?.size ?? 0;
        return {
          scope,
          conversations,
          handoffs,
          rate: conversations ? handoffs / conversations : 0,
        };
      })
      .sort((a, b) => b.conversations - a.conversations);

    return {
      flags: flags.data ?? [],
      routes: routes.data ?? [],
      conversations_24h: convCount.count ?? 0,
      messages_24h: msgCount.count ?? 0,
      avg_response_ms,
      p95_response_ms,
      total_cost_usd,
      safety_incidents_24h: Array.from(bucket.values()).sort((a, b) => b.count - a.count),
      latest_incidents: latest.data ?? [],
      tool_stats,
      handoff_by_scope,
    };
  });

export const Route = createFileRoute("/_authenticated/admin/ai/overview")({
  component: AiOverviewPage,
});

function AiOverviewPage() {
  const q = useQuery({ queryKey: ["ai-overview"], queryFn: () => getAiOverview() });

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">جاري التحميل...</div>;
  if (q.error)
    return (
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          icon={<MessagesSquare className="h-4 w-4" />}
          label="المحادثات"
          value={d.conversations_24h}
        />
        <KpiCard icon={<Activity className="h-4 w-4" />} label="الرسائل" value={d.messages_24h} />
        <KpiCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label="حوادث أمان"
          value={d.safety_incidents_24h.reduce((s, r) => s + r.count, 0)}
          tone={
            d.safety_incidents_24h.some((i) => i.severity === "critical" || i.severity === "high")
              ? "danger"
              : "default"
          }
        />
        <KpiCard
          icon={<Timer className="h-4 w-4" />}
          label="متوسط زمن الاستجابة"
          value={`${d.avg_response_ms} ms`}
          sub={`p95: ${d.p95_response_ms} ms`}
        />
        <KpiCard
          icon={<DollarSign className="h-4 w-4" />}
          label="تكلفة المحادثات (24س)"
          value={`$${d.total_cost_usd.toFixed(4)}`}
        />
        <KpiCard
          icon={<PhoneForwarded className="h-4 w-4" />}
          label="نسبة التحويل للبشر"
          value={
            d.handoff_by_scope.length
              ? `${(
                  (d.handoff_by_scope.reduce((s, r) => s + r.handoffs, 0) /
                    Math.max(
                      1,
                      d.handoff_by_scope.reduce((s, r) => s + r.conversations, 0),
                    )) *
                  100
                ).toFixed(1)}%`
              : "0%"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Wrench className="h-4 w-4" /> نجاح الأدوات وزمنها (24 ساعة)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {d.tool_stats.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا استدعاءات أدوات في آخر 24 ساعة.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2 text-start">الأداة</th>
                      <th className="p-2 text-end">الإجمالي</th>
                      <th className="p-2 text-end">نجاح</th>
                      <th className="p-2 text-end">متوسط ms</th>
                      <th className="p-2 text-end">p95 ms</th>
                      <th className="p-2 text-end">التكلفة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.tool_stats.map((t) => (
                      <tr key={t.tool} className="border-t">
                        <td className="p-2 font-mono text-xs">{t.tool}</td>
                        <td className="p-2 text-end">{t.total}</td>
                        <td className="p-2 text-end">
                          <Badge
                            variant={
                              t.success_rate >= 0.9
                                ? "default"
                                : t.success_rate >= 0.7
                                  ? "secondary"
                                  : "destructive"
                            }
                          >
                            {(t.success_rate * 100).toFixed(0)}%
                          </Badge>
                        </td>
                        <td className="p-2 text-end">{t.avg_latency_ms}</td>
                        <td className="p-2 text-end">{t.p95_latency_ms}</td>
                        <td className="p-2 text-end">${t.cost_usd.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <PhoneForwarded className="h-4 w-4" /> التحويل للبشر حسب نوع المستخدم
            </CardTitle>
          </CardHeader>
          <CardContent>
            {d.handoff_by_scope.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا محادثات في آخر 24 ساعة.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2 text-start">النوع</th>
                      <th className="p-2 text-end">محادثات</th>
                      <th className="p-2 text-end">تحويلات</th>
                      <th className="p-2 text-end">النسبة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.handoff_by_scope.map((r) => (
                      <tr key={r.scope} className="border-t">
                        <td className="p-2 font-mono text-xs">{r.scope}</td>
                        <td className="p-2 text-end">{r.conversations}</td>
                        <td className="p-2 text-end">{r.handoffs}</td>
                        <td className="p-2 text-end">
                          <Badge
                            variant={
                              r.rate >= 0.2
                                ? "destructive"
                                : r.rate >= 0.05
                                  ? "secondary"
                                  : "default"
                            }
                          >
                            {(r.rate * 100).toFixed(1)}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">مفاتيح التفعيل</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {d.flags.length === 0 && <p className="text-muted-foreground">لا توجد مفاتيح.</p>}
            {d.flags.map((f) => (
              <div
                key={f.key}
                className="flex items-start justify-between gap-3 rounded border p-2"
              >
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
          <CardHeader>
            <CardTitle className="text-sm">نماذج قيد الاستخدام</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {d.routes.map((r) => (
              <div
                key={r.route_name}
                className="flex items-center justify-between rounded border p-2"
              >
                <div>
                  <div className="text-xs font-semibold">{r.route_name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{r.model_id}</div>
                  {r.fallback_id && (
                    <div className="font-mono text-[11px] text-muted-foreground">
                      احتياطي: {r.fallback_id}
                    </div>
                  )}
                </div>
                <Badge variant={r.enabled ? "default" : "secondary"}>
                  {r.enabled ? "نشط" : "معطّل"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">أنواع حوادث الأمان (24 ساعة)</CardTitle>
        </CardHeader>
        <CardContent>
          {d.safety_incidents_24h.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا حوادث في آخر 24 ساعة.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-start">النوع</th>
                    <th className="p-2 text-start">الخطورة</th>
                    <th className="p-2 text-end">العدد</th>
                  </tr>
                </thead>
                <tbody>
                  {d.safety_incidents_24h.map((r) => (
                    <tr key={`${r.kind}-${r.severity}`} className="border-t">
                      <td className="p-2 font-mono text-xs">{r.kind}</td>
                      <td className="p-2">
                        <SeverityBadge severity={r.severity} />
                      </td>
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
        <CardHeader>
          <CardTitle className="text-sm">أحدث الحوادث</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {d.latest_incidents.length === 0 && (
            <p className="text-sm text-muted-foreground">لا شيء لعرضه.</p>
          )}
          {d.latest_incidents.map((i) => (
            <div
              key={i.id}
              className="flex items-start justify-between gap-3 rounded border p-2 text-sm"
            >
              <div>
                <div className="font-mono text-xs">{i.kind}</div>
                {i.action_taken && (
                  <p className="text-xs text-muted-foreground">إجراء: {i.action_taken}</p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {new Date(i.created_at).toLocaleString("ar-SA")}
                </p>
              </div>
              <SeverityBadge severity={i.severity} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: "danger" | "default";
  sub?: string;
}) {
  const display = typeof value === "number" ? value.toLocaleString("ar-SA") : value;
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`grid h-9 w-9 place-items-center rounded-lg ${tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}
        >
          {icon}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold">{display}</div>
          {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const variant =
    severity === "critical"
      ? "destructive"
      : severity === "high"
        ? "destructive"
        : severity === "warn"
          ? "secondary"
          : "outline";
  return <Badge variant={variant as "destructive" | "secondary" | "outline"}>{severity}</Badge>;
}
