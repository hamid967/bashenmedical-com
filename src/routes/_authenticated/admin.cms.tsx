import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCmsDashboard } from "@/lib/admin/cms/cms.functions";
import { CMS_KIND_LIST } from "@/lib/admin/cms/schemas";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ClipboardCheck, Clock, Archive, Send, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/cms")({
  head: () => ({
    meta: [
      { title: "إدارة المحتوى — لوحة القيادة" },
      { name: "description", content: "لوحة قيادة نظام إدارة محتوى الموقع" },
    ],
  }),
  component: CmsDashboard,
});

const STAT_CARDS = [
  { key: "draft", label: "مسودات", icon: FileText },
  { key: "in_review", label: "بانتظار المراجعة", icon: ClipboardCheck },
  { key: "approved", label: "معتمدة", icon: CheckCircle2 },
  { key: "scheduled", label: "مجدولة", icon: Clock },
  { key: "published", label: "منشورة", icon: Send },
  { key: "archived", label: "مؤرشفة", icon: Archive },
] as const;

function CmsDashboard() {
  const fetchFn = useServerFn(getCmsDashboard);
  const { data } = useSuspenseQuery({
    queryKey: ["cms", "dashboard"],
    queryFn: () => fetchFn(),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6 p-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">إدارة المحتوى</h1>
        <p className="text-sm text-muted-foreground">
          كل أسطح الموقع مع سير عمل: مسودة ← مراجعة ← نشر
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {STAT_CARDS.map(({ key, label, icon: Icon }) => (
          <Card key={key} className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </div>
            <div className="text-2xl font-bold mt-1">
              {(data.totals as any)[key] ?? 0}
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">أنواع المحتوى</h2>
          <Link to="/admin/cms/review" className="text-sm underline">
            طابور المراجعة
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {CMS_KIND_LIST.map((k) => (
            <Link
              key={k.key}
              to="/admin/cms/$kind"
              params={{ kind: k.key }}
              className="rounded border p-3 hover:bg-accent"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{k.label}</span>
                {k.singleton && <Badge variant="secondary">مفرد</Badge>}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 font-mono">{k.key}</div>
            </Link>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">آخر التحديثات</h2>
          <Link to="/admin/cms/audit" className="text-sm underline">
            سجل التدقيق
          </Link>
        </div>
        {data.recent.length === 0 ? (
          <div className="text-sm text-muted-foreground">لا يوجد نشاط بعد.</div>
        ) : (
          <ul className="space-y-2">
            {data.recent.map((r: any) => (
              <li key={r.id} className="flex items-center justify-between text-sm border-b py-2 last:border-0">
                <Link
                  to="/admin/cms/$kind/$id"
                  params={{ kind: r.kind, id: r.id }}
                  className="hover:underline"
                >
                  <span className="font-mono text-[11px] text-muted-foreground me-2">{r.kind}</span>
                  {r.title ?? "(بدون عنوان)"}
                </Link>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Badge variant="outline">{r.status}</Badge>
                  <span>AR {r.locale_completeness?.ar ?? 0}%</span>
                  <span>EN {r.locale_completeness?.en ?? 0}%</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
