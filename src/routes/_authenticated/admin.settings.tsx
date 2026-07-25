import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  RefreshCw,
  Search,
  X,
  AlertTriangle,
  Inbox,
  Settings,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { listSystemSettings } from "@/lib/admin/system-settings.functions";

type SettingsSearch = { q?: string; category?: string };

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [
      { title: "إعدادات النظام | لوحة الإدارة" },
      {
        name: "description",
        content: "استعراض إعدادات النظام المخزّنة مع البحث والتصنيف والحفر إلى تفاصيل كل إعداد.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (raw: Record<string, unknown>): SettingsSearch => ({
    q: typeof raw.q === "string" ? raw.q : undefined,
    category: typeof raw.category === "string" ? raw.category : undefined,
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل الإعدادات</h2>
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
      لا توجد إعدادات مسجّلة.
    </div>
  ),
  component: AdminSettingsRoute,
});

function AdminSettingsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const listFn = useServerFn(listSystemSettings);
  const [qInput, setQInput] = useState(search.q ?? "");

  const query = useQuery({
    queryKey: ["admin-system-settings", search],
    queryFn: () => listFn({ data: { q: search.q, category: search.category } }),
  });

  const rows = query.data?.rows ?? [];
  const categories = query.data?.categories ?? [];

  const grouped = useMemo(() => {
    const g = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = g.get(r.category) ?? [];
      arr.push(r);
      g.set(r.category, arr);
    }
    return Array.from(g.entries()).sort(([a], [b]) => a.localeCompare(b, "ar"));
  }, [rows]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ search: { ...search, q: qInput.trim() || undefined } });
  };

  const clear = () => {
    setQInput("");
    navigate({ search: {} });
  };

  const hasFilters = Boolean(search.q || search.category);

  return (
    <div className="container-app py-6 space-y-4">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold">إعدادات النظام</h1>
            <p className="text-sm text-muted-foreground">
              {rows.length > 0
                ? `${rows.length} إعداد · ${grouped.length} فئة`
                : "استعراض جميع مفاتيح الإعدادات المخزّنة"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </header>

      <form
        onSubmit={submitSearch}
        className="flex gap-2 items-center flex-wrap rounded-lg border bg-card p-3"
        role="search"
      >
        <div className="relative flex-1 min-w-[220px]">
          <Search
            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="بحث بالمفتاح أو الوصف…"
            className="w-full rounded-md border bg-background pr-9 pl-3 py-2 text-sm"
            aria-label="بحث الإعدادات"
          />
        </div>
        <select
          value={search.category ?? ""}
          onChange={(e) =>
            navigate({ search: { ...search, category: e.target.value || undefined } })
          }
          className="rounded-md border bg-background px-3 py-2 text-sm"
          aria-label="فلترة الفئة"
        >
          <option value="">كل الفئات</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          بحث
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" /> مسح
          </button>
        )}
      </form>

      {query.isLoading ? (
        <div className="rounded-lg border bg-card p-4 space-y-3" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 rounded-md bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-destructive">
          <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
          {(query.error as Error)?.message ?? "تعذّر التحميل"}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
          <Inbox className="mx-auto h-10 w-10 mb-3" aria-hidden="true" />
          <p className="text-sm">{hasFilters ? "لا نتائج مطابقة." : "لا توجد إعدادات بعد."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([cat, items]) => (
            <CategoryGroup key={cat} category={cat} items={items} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryGroup({
  category,
  items,
}: {
  category: string;
  items: Array<{
    key: string;
    value: unknown;
    description: string | null;
    updated_at: string;
    category: string;
  }>;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/40 text-right"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          )}
          <span className="font-medium">{category}</span>
          <span className="text-xs text-muted-foreground">({items.length})</span>
        </div>
      </button>
      {open && (
        <div className="overflow-x-auto border-t">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-right">
              <tr>
                <th className="p-3 font-medium">المفتاح</th>
                <th className="p-3 font-medium">القيمة</th>
                <th className="p-3 font-medium">الوصف</th>
                <th className="p-3 font-medium">آخر تحديث</th>
                <th className="p-3 font-medium sr-only">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.key} className="border-t hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs">{r.key}</td>
                  <td
                    className="p-3 font-mono text-xs max-w-[240px] truncate"
                    title={preview(r.value)}
                  >
                    {preview(r.value)}
                  </td>
                  <td
                    className="p-3 text-xs text-muted-foreground max-w-[280px] truncate"
                    title={r.description ?? ""}
                  >
                    {r.description ?? "—"}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.updated_at).toLocaleString("ar-SA")}
                  </td>
                  <td className="p-3 text-left">
                    <Link
                      to="/admin/settings/$key"
                      params={{ key: r.key }}
                      className="text-primary hover:underline text-sm"
                    >
                      عرض
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function preview(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
