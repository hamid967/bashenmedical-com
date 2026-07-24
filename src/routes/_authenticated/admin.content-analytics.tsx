import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  getContentAnalytics,
  type ContentAnalyticsResult,
  type ContentAnalyticsRow,
} from "@/lib/admin/content-analytics.functions";
import { listContentItems } from "@/lib/admin/content.functions";
import { listBranchesLite } from "@/lib/admin/no-show-stats.functions";

export const Route = createFileRoute("/_authenticated/admin/content-analytics")({
  head: () => ({
    meta: [
      { title: "تحليلات المحتوى | Baeshen Admin" },
      {
        name: "description",
        content: "مشاهدات ونقرات محتوى لوحة المريض حسب العنصر والفرع واللغة والشريحة.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
    links: [{ rel: "canonical", href: "https://bashenmedical.com/admin/content-analytics" }],
  }),
  component: ContentAnalyticsPage,
});

const CONTENT_TYPES = [
  "announcement",
  "offer",
  "screening",
  "new_service",
  "reminder",
  "doctor_spotlight",
  "nearest_slot",
  "suggested_service",
] as const;

function daysAgoISO(n: number): string {
  return new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();
}
function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}
function fromDateInput(v: string, endOfDay = false): string {
  const d = new Date(v + (endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"));
  return d.toISOString();
}
function fmtPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}
function fmtInt(x: number): string {
  return x.toLocaleString("ar-EG");
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: ContentAnalyticsRow[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.impressions));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد بيانات.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const pct = Math.round((r.impressions / max) * 100);
              return (
                <div key={r.key} className="space-y-1">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="truncate flex-1">{r.label}</span>
                    <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                      {fmtInt(r.impressions)} / {fmtInt(r.clicks)}
                      <span className="text-xs ms-2">({fmtPct(r.ctr)})</span>
                    </span>
                  </div>
                  <div className="h-2 bg-muted/40 rounded overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DailyChart({ data }: { data: ContentAnalyticsResult["daily"] }) {
  if (!data.length) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        لا توجد بيانات في هذا النطاق.
      </p>
    );
  }
  const w = 720;
  const h = 180;
  const pad = 28;
  const max = Math.max(1, ...data.map((d) => Math.max(d.impressions, d.clicks)));
  const step = (w - pad * 2) / Math.max(data.length - 1, 1);
  const path = (key: "impressions" | "clicks") =>
    data
      .map((d, i) => {
        const x = pad + i * step;
        const y = h - pad - (d[key] / max) * (h - pad * 2);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ minWidth: 480 }}>
        <line
          x1={pad}
          y1={h - pad}
          x2={w - pad}
          y2={h - pad}
          stroke="hsl(var(--border))"
        />
        <path d={path("impressions")} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} />
        <path
          d={path("clicks")}
          fill="none"
          stroke="hsl(var(--destructive))"
          strokeWidth={2}
          strokeDasharray="4 3"
        />
        {data.map((d, i) => {
          const x = pad + i * step;
          if (i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)) {
            return (
              <text
                key={d.date}
                x={x}
                y={h - 8}
                fontSize={10}
                textAnchor="middle"
                fill="hsl(var(--muted-foreground))"
              >
                {d.date.slice(5)}
              </text>
            );
          }
          return null;
        })}
      </svg>
      <div className="flex gap-4 text-xs text-muted-foreground mt-2">
        <span className="flex items-center gap-2">
          <span className="inline-block w-3 h-0.5 bg-primary" /> مشاهدات
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-0.5"
            style={{
              background: "hsl(var(--destructive))",
              borderTop: "1px dashed hsl(var(--destructive))",
            }}
          />{" "}
          نقرات
        </span>
      </div>
    </div>
  );
}

function ContentAnalyticsPage() {
  const [from, setFrom] = useState(toDateInput(daysAgoISO(30)));
  const [to, setTo] = useState(toDateInput(new Date().toISOString()));
  const [branchId, setBranchId] = useState<string>("");
  const [language, setLanguage] = useState<"" | "ar" | "en">("");
  const [itemId, setItemId] = useState<string>("");
  const [type, setType] = useState<string>("");

  const getAnalytics = useServerFn(getContentAnalytics);
  const getBranches = useServerFn(listBranchesLite);
  const getItems = useServerFn(listContentItems);

  const branchesQ = useQuery({
    queryKey: ["admin-branches-lite"],
    queryFn: () => getBranches(),
  });
  const itemsQ = useQuery({
    queryKey: ["admin-content-items-lite"],
    queryFn: () => getItems({ data: { limit: 200 } }),
  });

  const analyticsQ = useQuery<ContentAnalyticsResult>({
    queryKey: ["admin-content-analytics", from, to, branchId, language, itemId, type],
    queryFn: () =>
      getAnalytics({
        data: {
          from: fromDateInput(from),
          to: fromDateInput(to, true),
          branchId: branchId || undefined,
          language: language || undefined,
          itemId: itemId || undefined,
          type: type || undefined,
        },
      }),
  });

  const applyQuick = (n: number) => {
    setFrom(toDateInput(daysAgoISO(n)));
    setTo(toDateInput(new Date().toISOString()));
  };

  const items = useMemo(
    () =>
      ((itemsQ.data ?? []) as Array<{ id: string; title_ar: string; title_en: string }>).map(
        (i) => ({ id: i.id, label: i.title_ar || i.title_en }),
      ),
    [itemsQ.data],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">تحليلات المحتوى</h1>
          <p className="text-sm text-muted-foreground">
            مشاهدات ونقرات حسب العنصر، الفرع، اللغة، الشريحة، والفترة.
          </p>
        </div>
        <div className="ms-auto">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/content">إدارة المحتوى</Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div>
              <Label className="text-xs">من</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">إلى</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
                  <option key={b.id} value={b.id}>
                    {b.name_ar}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">اللغة</Label>
              <select
                className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                value={language}
                onChange={(e) => setLanguage(e.target.value as "" | "ar" | "en")}
              >
                <option value="">الكل</option>
                <option value="ar">العربية</option>
                <option value="en">الإنجليزية</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">النوع</Label>
              <select
                className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">الكل</option>
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">عنصر محدد</Label>
              <select
                className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
              >
                <option value="">الكل</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[7, 30, 90, 180, 365].map((n) => (
              <Button key={n} size="sm" variant="outline" onClick={() => applyQuick(n)}>
                آخر {n} يوم
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {analyticsQ.isLoading && (
        <div className="text-center text-muted-foreground py-12">جاري التحميل...</div>
      )}
      {analyticsQ.error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-destructive">
            خطأ: {(analyticsQ.error as Error).message}
          </CardContent>
        </Card>
      )}

      {analyticsQ.data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  إجمالي المشاهدات
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tabular-nums">
                  {fmtInt(analyticsQ.data.totals.impressions)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  إجمالي النقرات
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tabular-nums">
                  {fmtInt(analyticsQ.data.totals.clicks)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  معدل النقر (CTR)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tabular-nums">
                  {fmtPct(analyticsQ.data.totals.ctr)}
                </div>
              </CardContent>
            </Card>
          </div>

          {analyticsQ.data.sampled && (
            <Badge variant="outline" className="text-amber-600 border-amber-600">
              تنبيه: تم تقليص العينة (تجاوز الحد الأقصى للسجلات). فكِّر بتضييق النطاق الزمني.
            </Badge>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">الاتجاه اليومي</CardTitle>
            </CardHeader>
            <CardContent>
              <DailyChart data={analyticsQ.data.daily} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BreakdownTable title="حسب العنصر" rows={analyticsQ.data.byItem} />
            <BreakdownTable title="حسب النوع" rows={analyticsQ.data.byType} />
            <BreakdownTable title="حسب الفرع" rows={analyticsQ.data.byBranch} />
            <BreakdownTable title="حسب لغة المستخدم" rows={analyticsQ.data.byLanguage} />
            <BreakdownTable title="حسب الشريحة (Audience)" rows={analyticsQ.data.bySegment} />
          </div>
        </>
      )}
    </div>
  );
}
