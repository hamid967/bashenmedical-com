import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertConsoleAccess } from "@/lib/admin/_guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui-v3";
import { Badge } from "@/components/ui-v3";
import { ShieldAlert, AlertTriangle, Ban, Activity } from "lucide-react";
import { useState } from "react";

interface Incident {
  id: string;
  conversation_id: string | null;
  actor: string | null;
  kind: string;
  severity: string;
  action_taken: string | null;
  created_at: string;
}

const getSafetyIncidents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: { kind?: string; severity?: string; hours?: number }) => ({
    kind: v?.kind ?? "all",
    severity: v?.severity ?? "all",
    hours: Math.min(720, Math.max(1, Number(v?.hours ?? 24))),
  }))
  .handler(async ({ context, data }) => {
    await assertConsoleAccess(context);
    const since = new Date(Date.now() - data.hours * 3600 * 1000).toISOString();
    let query = context.supabase
      .from("ai_safety_incidents")
      .select("id, conversation_id, actor, kind, severity, action_taken, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.kind !== "all") query = query.eq("kind", data.kind);
    if (data.severity !== "all") query = query.eq("severity", data.severity);
    const { data: rows } = await query;
    const list = (rows ?? []) as Incident[];

    const byKind = new Map<string, number>();
    const bySeverity = new Map<string, number>();
    for (const r of list) {
      byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
      bySeverity.set(r.severity, (bySeverity.get(r.severity) ?? 0) + 1);
    }
    return {
      incidents: list,
      by_kind: Array.from(byKind, ([kind, count]) => ({ kind, count })).sort(
        (a, b) => b.count - a.count,
      ),
      by_severity: Array.from(bySeverity, ([severity, count]) => ({ severity, count })).sort(
        (a, b) => b.count - a.count,
      ),
    };
  });

export const Route = createFileRoute("/_authenticated/admin/ai/safety")({
  head: () => ({
    meta: [
      { title: "AI Safety Incidents · لوحة الإدارة" },
      { name: "description", content: "متابعة حوادث أمان مساعد باعشن الذكي." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AiSafetyPage,
});

const KIND_OPTIONS = [
  { value: "all", label: "كل الأنواع" },
  { value: "emergency_detected", label: "طوارئ" },
  { value: "medical_diagnosis_request", label: "طلب تشخيص" },
  { value: "prompt_injection_attempt", label: "حقن أوامر" },
];
const SEV_OPTIONS = [
  { value: "all", label: "كل الشدّات" },
  { value: "critical", label: "حرج" },
  { value: "high", label: "مرتفع" },
  { value: "warn", label: "تحذير" },
  { value: "info", label: "معلومات" },
];
const HOURS_OPTIONS = [
  { value: 24, label: "24 ساعة" },
  { value: 72, label: "3 أيام" },
  { value: 168, label: "7 أيام" },
  { value: 720, label: "30 يومًا" },
];

function AiSafetyPage() {
  const [kind, setKind] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [hours, setHours] = useState(24);
  const q = useQuery({
    queryKey: ["ai-safety", kind, severity, hours],
    queryFn: () => getSafetyIncidents({ data: { kind, severity, hours } }),
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-destructive/10 text-destructive">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">أمان المساعد الذكي — الحوادث</h1>
          <p className="text-xs text-muted-foreground">
            رصد التصنيفات: طوارئ، طلب تشخيص، محاولات حقن أوامر.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterSelect label="النوع" value={kind} onChange={setKind} options={KIND_OPTIONS} />
        <FilterSelect
          label="الشدّة"
          value={severity}
          onChange={setSeverity}
          options={SEV_OPTIONS}
        />
        <FilterSelect
          label="النافذة"
          value={String(hours)}
          onChange={(v) => setHours(Number(v))}
          options={HOURS_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
        />
      </div>

      {q.isLoading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}
      {q.error && <p className="text-sm text-destructive">تعذّر تحميل حوادث الأمان.</p>}

      {q.data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs flex items-center gap-2">
                  <Activity className="h-4 w-4" /> إجمالي الحوادث
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{q.data.incidents.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> حرج/مرتفع
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {
                    q.data.incidents.filter(
                      (i) => i.severity === "critical" || i.severity === "high",
                    ).length
                  }
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs flex items-center gap-2">
                  <Ban className="h-4 w-4" /> محاولات حقن
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {q.data.incidents.filter((i) => i.kind === "prompt_injection_attempt").length}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">التوزيع حسب النوع</CardTitle>
              </CardHeader>
              <CardContent>
                {q.data.by_kind.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا حوادث في هذه النافذة.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {q.data.by_kind.map((r) => (
                      <li
                        key={r.kind}
                        className="flex items-center justify-between rounded border p-2"
                      >
                        <span className="font-mono text-xs">{r.kind}</span>
                        <Badge variant="secondary">{r.count}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">التوزيع حسب الشدّة</CardTitle>
              </CardHeader>
              <CardContent>
                {q.data.by_severity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا حوادث في هذه النافذة.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {q.data.by_severity.map((r) => (
                      <li
                        key={r.severity}
                        className="flex items-center justify-between rounded border p-2"
                      >
                        <span className="font-mono text-xs">{r.severity}</span>
                        <Badge variant={severityTone(r.severity)}>{r.count}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">آخر الحوادث</CardTitle>
            </CardHeader>
            <CardContent>
              {q.data.incidents.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا حوادث بالنطاق المحدد.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr>
                        <th className="p-2 text-start">الوقت</th>
                        <th className="p-2 text-start">النوع</th>
                        <th className="p-2 text-start">الشدّة</th>
                        <th className="p-2 text-start">الإجراء</th>
                        <th className="p-2 text-start">المحادثة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.data.incidents.slice(0, 200).map((i) => (
                        <tr key={i.id} className="border-t align-top">
                          <td className="p-2 whitespace-nowrap text-xs">
                            {new Date(i.created_at).toLocaleString("ar-SA")}
                          </td>
                          <td className="p-2 font-mono text-xs">{i.kind}</td>
                          <td className="p-2">
                            <Badge variant={severityTone(i.severity)}>{i.severity}</Badge>
                          </td>
                          <td className="p-2 text-xs">{i.action_taken ?? "—"}</td>
                          <td className="p-2 font-mono text-[11px] text-muted-foreground">
                            {i.conversation_id ? i.conversation_id.slice(0, 8) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function severityTone(s: string): "default" | "secondary" | "destructive" {
  if (s === "critical" || s === "high") return "destructive";
  if (s === "warn") return "secondary";
  return "default";
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border bg-background px-2 py-1 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
