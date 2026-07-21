import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import {
  getVisualAnalytics,
  type VisualAnalytics,
  type HeatCell,
  type DoctorSparkline,
} from "@/lib/admin/no-show-visual.functions";
import { listDoctorsLite, listBranchesLite } from "@/lib/admin/no-show-stats.functions";

export const Route = createFileRoute("/_authenticated/admin/visual-analytics")({
  head: () => ({
    meta: [
      { title: "لوحة تحليلات بصرية | Baeshen Admin" },
      { name: "description", content: "Heatmap + Funnel + Sparklines لتحليل عدم الحضور." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: VisualAnalyticsPage,
});

const DOW_LABELS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 07..21

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function heatColor(rate: number, hasData: boolean): string {
  if (!hasData) return "hsl(var(--muted) / 0.35)";
  // 0 → green, 25 → amber, 50+ → red
  const clamped = Math.min(rate, 60) / 60;
  const hue = 140 - clamped * 140; // 140 (green) → 0 (red)
  const light = 55 - clamped * 15;
  return `hsl(${hue.toFixed(0)} 70% ${light.toFixed(0)}%)`;
}

function Heatmap({ cells }: { cells: HeatCell[] }) {
  const grid = useMemo(() => {
    const m = new Map<string, HeatCell>();
    for (const c of cells) m.set(`${c.dow}:${c.hour}`, c);
    return m;
  }, [cells]);
  const [hover, setHover] = useState<HeatCell | null>(null);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="text-xs text-muted-foreground w-16"></th>
              {HOURS.map((h) => (
                <th key={h} className="text-[10px] text-muted-foreground font-normal w-8 text-center">
                  {String(h).padStart(2, "0")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DOW_LABELS.map((label, dow) => (
              <tr key={dow}>
                <td className="text-xs text-muted-foreground pr-2 whitespace-nowrap">{label}</td>
                {HOURS.map((h) => {
                  const cell = grid.get(`${dow}:${h}`);
                  const bg = heatColor(cell?.no_show_rate ?? 0, !!cell);
                  return (
                    <td
                      key={h}
                      className="rounded-sm cursor-pointer transition-transform hover:scale-110"
                      style={{ background: bg, width: 32, height: 28 }}
                      onMouseEnter={() => cell && setHover(cell)}
                      onMouseLeave={() => setHover(null)}
                      title={cell ? `${cell.no_show_rate}% (${cell.no_show}/${cell.total})` : "لا بيانات"}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-sm" style={{ background: heatColor(0, true) }} />
          <span>منخفض</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-sm" style={{ background: heatColor(30, true) }} />
          <span>متوسط</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-sm" style={{ background: heatColor(60, true) }} />
          <span>مرتفع</span>
        </div>
        {hover && (
          <div className="ms-auto text-foreground">
            {DOW_LABELS[hover.dow]} {String(hover.hour).padStart(2, "0")}:00 —
            <span className="font-semibold ms-1">{hover.no_show_rate}%</span>
            <span className="text-muted-foreground ms-1">({hover.no_show}/{hover.total})</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Funnel({ stages }: { stages: VisualAnalytics["funnel"] }) {
  const booked = stages.find((s) => s.key === "booked")?.count ?? 0;
  const max = booked || 1;
  return (
    <div className="space-y-3">
      {stages.map((s) => {
        const pct = booked ? Math.round((s.count / max) * 1000) / 10 : 0;
        const negative = s.key === "no_show" || s.key === "cancelled";
        return (
          <div key={s.key} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>{s.label_ar}</span>
              <span className="text-muted-foreground tabular-nums">
                {s.count.toLocaleString("ar-EG")} <span className="text-xs">({pct}%)</span>
              </span>
            </div>
            <div className="h-6 bg-muted/40 rounded overflow-hidden">
              <div
                className={`h-full transition-all ${negative ? "bg-destructive/70" : "bg-primary"}`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Sparkline({ series, color = "hsl(var(--primary))" }: { series: number[]; color?: string }) {
  if (!series.length) return null;
  const w = 120, h = 32, pad = 2;
  const max = Math.max(...series, 20);
  const step = (w - pad * 2) / Math.max(series.length - 1, 1);
  const pts = series.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - (v / max) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="inline-block">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

function VisualAnalyticsPage() {
  const router = useRouter();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [doctorId, setDoctorId] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("");

  const getStats = useServerFn(getVisualAnalytics);
  const getDoctors = useServerFn(listDoctorsLite);
  const getBranches = useServerFn(listBranchesLite);

  const doctorsQ = useQuery({ queryKey: ["admin-doctors-lite"], queryFn: () => getDoctors() });
  const branchesQ = useQuery({ queryKey: ["admin-branches-lite"], queryFn: () => getBranches() });

  const statsQ = useQuery<VisualAnalytics>({
    queryKey: ["admin-visual-analytics", from, to, doctorId, branchId],
    queryFn: () =>
      getStats({
        data: {
          from, to,
          doctorId: doctorId || undefined,
          branchId: branchId || undefined,
        },
      }),
  });

  const applyQuickRange = (n: number) => {
    setFrom(daysAgo(n));
    setTo(today());
  };

  return (
    <div className="space-y-6">
        <header className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold">لوحة تحليلات بصرية</h1>
            <p className="text-sm text-muted-foreground">Heatmap + Funnel + Sparklines وتنبيهات الشذوذ</p>
          </div>
          <div className="ms-auto">
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/no-show-stats">إلى الإحصاءات التفصيلية</Link>
            </Button>
          </div>
        </header>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <Label className="text-xs">من</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">إلى</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">الطبيب</Label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                  value={doctorId}
                  onChange={(e) => setDoctorId(e.target.value)}
                >
                  <option value="">الكل</option>
                  {(doctorsQ.data ?? []).map((d) => (
                    <option key={d.id} value={d.id}>{d.name_ar}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">الفرع</Label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  <option value="">الكل</option>
                  {(branchesQ.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>{b.name_ar}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={() => router.invalidate()}>تحديث</Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {[7, 30, 90, 180, 365].map((n) => (
                <Button key={n} size="sm" variant="outline" onClick={() => applyQuickRange(n)}>
                  آخر {n} يوم
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {statsQ.isLoading && (
          <div className="text-center text-muted-foreground py-12">جاري التحميل...</div>
        )}
        {statsQ.error && (
          <Card className="border-destructive">
            <CardContent className="pt-6 text-destructive">
              خطأ: {(statsQ.error as Error).message}
            </CardContent>
          </Card>
        )}

        {statsQ.data && (
          <>
            {statsQ.data.anomalies.length > 0 && (
              <Card className="border-destructive/40 bg-destructive/5">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    تنبيهات شذوذ ({statsQ.data.anomalies.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {statsQ.data.anomalies.slice(0, 6).map((a) => (
                      <div key={a.doctor_id} className="flex items-center gap-3 text-sm p-2 rounded bg-background">
                        <TrendingUp className="h-4 w-4 text-destructive" />
                        <span className="font-medium flex-1 truncate">{a.doctor_name_ar ?? "—"}</span>
                        <Badge variant="destructive">+{a.delta} نقطة</Badge>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {a.baseline_rate}% → {a.recent_rate}%
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Heatmap: أيام الأسبوع × الساعات</CardTitle>
                </CardHeader>
                <CardContent>
                  <Heatmap cells={statsQ.data.heatmap} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Funnel: مراحل الموعد</CardTitle>
                </CardHeader>
                <CardContent>
                  <Funnel stages={statsQ.data.funnel} />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">اتجاه الأطباء (Sparklines)</CardTitle>
              </CardHeader>
              <CardContent>
                {statsQ.data.doctors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا يوجد أطباء بحجم بيانات كافٍ.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b">
                          <th className="text-start py-2 font-normal">الطبيب</th>
                          <th className="text-end py-2 font-normal">إجمالي</th>
                          <th className="text-end py-2 font-normal">نسبة عدم الحضور</th>
                          <th className="text-end py-2 font-normal">الاتجاه</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statsQ.data.doctors.map((d: DoctorSparkline) => {
                          const first = d.series.slice(0, Math.floor(d.series.length / 2));
                          const second = d.series.slice(Math.floor(d.series.length / 2));
                          const avg = (arr: number[]) => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
                          const trend = avg(second) - avg(first);
                          const trendUp = trend > 5;
                          const trendDown = trend < -5;
                          return (
                            <tr key={d.doctor_id} className="border-b hover:bg-muted/30">
                              <td className="py-2">{d.doctor_name_ar ?? "—"}</td>
                              <td className="py-2 text-end tabular-nums">{d.total}</td>
                              <td className="py-2 text-end tabular-nums">
                                <span className={d.no_show_rate >= 25 ? "text-destructive font-semibold" : ""}>
                                  {d.no_show_rate}%
                                </span>
                              </td>
                              <td className="py-2 text-end">
                                <div className="inline-flex items-center gap-2">
                                  <Sparkline
                                    series={d.series}
                                    color={trendUp ? "hsl(var(--destructive))" : trendDown ? "hsl(140 70% 40%)" : "hsl(var(--primary))"}
                                  />
                                  {trendUp && <TrendingUp className="h-3 w-3 text-destructive" />}
                                  {trendDown && <TrendingDown className="h-3 w-3 text-green-600" />}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
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
