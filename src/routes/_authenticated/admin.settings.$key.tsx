import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, AlertTriangle, ArrowRight, Settings } from "lucide-react";
import { getSystemSetting } from "@/lib/admin/system-settings.functions";

export const Route = createFileRoute("/_authenticated/admin/settings/$key")({
  head: ({ params }) => ({
    meta: [
      { title: `الإعداد ${params.key} | لوحة الإدارة` },
      { name: "description", content: `تفاصيل قيمة الإعداد ${params.key}.` },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل الإعداد</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
      >
        <RefreshCw className="h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="container-app py-16 text-center text-muted-foreground">
      الإعداد غير موجود.
    </div>
  ),
  component: SettingDetail,
});

function SettingDetail() {
  const { key } = Route.useParams();
  const fn = useServerFn(getSystemSetting);
  const query = useQuery({
    queryKey: ["admin-system-setting", key],
    queryFn: () => fn({ data: { key } }),
  });

  return (
    <div className="container-app py-6 space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          to="/admin/settings"
          className="hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowRight className="h-4 w-4" /> إعدادات النظام
        </Link>
        <span>/</span>
        <span className="text-foreground font-mono">{key}</span>
      </div>

      <header className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-primary" aria-hidden="true" />
        <div>
          <h1 className="text-xl font-semibold font-mono">{key}</h1>
          <p className="text-sm text-muted-foreground">تفاصيل قيمة الإعداد</p>
        </div>
      </header>

      {query.isLoading ? (
        <div className="rounded-lg border bg-card p-6 space-y-3" aria-busy="true">
          <div className="h-4 w-1/3 rounded-md bg-muted/60 animate-pulse" />
          <div className="h-4 w-2/3 rounded-md bg-muted/60 animate-pulse" />
          <div className="h-48 rounded-md bg-muted/50 animate-pulse" />
        </div>
      ) : query.isError ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-destructive">
          <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
          {(query.error as Error)?.message ?? "تعذّر التحميل"}
        </div>
      ) : query.data ? (
        <>
          <section className="rounded-lg border bg-card p-4 space-y-2">
            <MetaRow label="الفئة" value={query.data.category} />
            <MetaRow label="الوصف" value={query.data.description ?? "—"} />
            <MetaRow
              label="آخر تحديث"
              value={new Date(query.data.updated_at).toLocaleString("ar-SA")}
            />
            <MetaRow
              label="بواسطة"
              value={query.data.updated_by_name ?? query.data.updated_by ?? "—"}
              mono={!query.data.updated_by_name && !!query.data.updated_by}
            />
          </section>

          <section>
            <h2 className="text-sm font-medium text-muted-foreground mb-2">القيمة</h2>
            <pre className="rounded-lg border bg-muted/40 p-4 text-xs whitespace-pre-wrap break-words max-h-[500px] overflow-auto">
              {formatValue(query.data.value)}
            </pre>
          </section>
        </>
      ) : null}
    </div>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1 border-b last:border-b-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-sm text-right ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v == null) return "null";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
