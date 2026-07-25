/**
 * E1 Observability — SLO / SLI panel.
 * Renders the compact signal snapshot from `getSloSummary` and lets
 * an admin change the evaluation window.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSloSummary, type SloSignal } from "@/lib/admin/observability.functions";

const WINDOWS = [
  { label: "1h", value: 1 },
  { label: "24h", value: 24 },
  { label: "7d", value: 24 * 7 },
];

function statusUi(status: SloSignal["status"]) {
  if (status === "ok")
    return {
      color: "text-emerald-600 dark:text-emerald-400",
      badge: "default" as const,
      icon: CheckCircle2,
      label: "OK",
    };
  if (status === "warn")
    return {
      color: "text-amber-600 dark:text-amber-400",
      badge: "secondary" as const,
      icon: TriangleAlert,
      label: "WARN",
    };
  return {
    color: "text-red-600 dark:text-red-400",
    badge: "destructive" as const,
    icon: AlertTriangle,
    label: "BREACH",
  };
}

export function SloPanel() {
  const [windowHours, setWindowHours] = useState(24);
  const fetchSummary = useServerFn(getSloSummary);
  const q = useQuery({
    queryKey: ["slo-summary", windowHours],
    queryFn: () => fetchSummary({ data: { windowHours } }),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">SLO / SLI Snapshot</h2>
          <p className="text-xs text-muted-foreground">
            نافذة التقييم:{" "}
            <span className="font-mono">
              {windowHours >= 24 ? `${windowHours / 24}d` : `${windowHours}h`}
            </span>
          </p>
        </div>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <Button
              key={w.value}
              size="sm"
              variant={windowHours === w.value ? "default" : "outline"}
              onClick={() => setWindowHours(w.value)}
            >
              {w.label}
            </Button>
          ))}
        </div>
      </div>

      {q.isLoading && <div className="text-sm text-muted-foreground">جاري الاحتساب…</div>}
      {q.error && (
        <div className="text-sm text-red-600">
          {(q.error as Error).message || "تعذّر جلب البيانات"}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {q.data?.signals.map((s) => {
          const ui = statusUi(s.status);
          const Icon = ui.icon;
          return (
            <Card key={s.key} className="border-l-4" style={{ borderLeftColor: "currentColor" }}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span className="truncate">{s.label}</span>
                  <Badge variant={ui.badge}>{ui.label}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className={`flex items-baseline gap-1 ${ui.color}`}>
                  <Icon className="h-5 w-5" aria-hidden />
                  <span className="text-2xl font-bold tabular-nums">
                    {typeof s.value === "number" ? s.value.toLocaleString() : "—"}
                  </span>
                  <span className="text-xs font-medium opacity-70">{s.unit}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  الهدف: ≤ {s.target.toLocaleString()} {s.unit}
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2">{s.detail}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {q.data && (
        <p className="text-[11px] text-muted-foreground">
          حُدِّث: {new Date(q.data.generated_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}
