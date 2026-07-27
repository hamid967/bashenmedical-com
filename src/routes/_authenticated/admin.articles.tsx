import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Newspaper,
  RefreshCw,
  AlertTriangle,
  Search,
  ChevronLeft,
  CheckCircle2,
  FileText,
  Timer,
  FolderTree,
  BookOpen,
} from "lucide-react";
import { listAdminArticles } from "@/lib/admin/articles.functions";

export const Route = createFileRoute("/_authenticated/admin/articles")({
  head: () => ({
    meta: [
      { title: "المقالات الصحية | لوحة الإدارة" },
      { name: "description", content: "إدارة مقالات المحتوى الصحي والنشر." },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل المقالات</h2>
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
  component: ArticlesList,
});

function ArticlesList() {
  const fn = useServerFn(listAdminArticles);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "published" | "draft">("all");
  const [categoryId, setCategoryId] = useState<string>("");

  const query = useQuery({
    queryKey: ["admin-articles", q, status, categoryId],
    queryFn: () =>
      fn({
        data: {
          q: q.trim() || undefined,
          status,
          categoryId: categoryId || undefined,
        },
      }),
  });

  return (
    <div className="container-app py-6 space-y-4">
      <header className="flex items-center gap-3">
        <Newspaper className="h-6 w-6 text-primary" aria-hidden="true" />
        <div>
          <h1 className="text-xl font-semibold">المقالات الصحية</h1>
          <p className="text-sm text-muted-foreground">إدارة مقالات المحتوى، النشر، والتصنيفات</p>
        </div>
      </header>

      <section aria-label="مؤشرات المقالات" className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          label="إجمالي المقالات"
          value={query.data?.kpis.total}
          icon={FileText}
          loading={query.isLoading}
          error={query.isError}
        />
        <KpiCard
          label="منشورة"
          value={query.data?.kpis.published}
          icon={CheckCircle2}
          loading={query.isLoading}
          error={query.isError}
          tone="success"
        />
        <KpiCard
          label="مسودّات"
          value={query.data?.kpis.draft}
          icon={FileText}
          loading={query.isLoading}
          error={query.isError}
          tone="muted"
        />
        <KpiCard
          label="تصنيفات مستخدمة"
          value={query.data?.kpis.categories_used}
          icon={FolderTree}
          loading={query.isLoading}
          error={query.isError}
        />
        <KpiCard
          label="متوسط دقائق القراءة"
          value={query.data?.kpis.avg_reading_minutes}
          icon={Timer}
          loading={query.isLoading}
          error={query.isError}
        />
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث بالعنوان أو الـslug"
            className="w-full rounded-md border bg-background pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="بحث"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as unknown)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
          aria-label="الحالة"
        >
          <option value="all">كل الحالات</option>
          <option value="published">منشورة</option>
          <option value="draft">مسودّات</option>
        </select>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm max-w-[200px]"
          aria-label="التصنيف"
        >
          <option value="">كل التصنيفات</option>
          {(query.data?.categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name_ar}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => query.refetch()}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          aria-label="تحديث"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </section>

      {query.isLoading ? (
        <div className="rounded-lg border bg-card p-6 space-y-3" aria-busy="true">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-muted/60 animate-pulse" />
          ))}
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-8 text-center text-sm text-destructive"
        >
          <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
          {(query.error as Error)?.message ?? "تعذّر التحميل"}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => query.refetch()}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs hover:bg-background"
            >
              <RefreshCw className="h-3 w-3" /> إعادة المحاولة
            </button>
          </div>
        </div>
      ) : !query.data?.rows.length ? (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          <BookOpen className="mx-auto h-10 w-10 opacity-40 mb-2" />
          لا توجد مقالات تطابق البحث الحالي.
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs">
                <tr className="text-right">
                  <th className="px-3 py-2 font-medium">المقال</th>
                  <th className="px-3 py-2 font-medium">التصنيف</th>
                  <th className="px-3 py-2 font-medium">الحالة</th>
                  <th className="px-3 py-2 font-medium">دقائق القراءة</th>
                  <th className="px-3 py-2 font-medium">آخر تحديث</th>
                  <th className="px-3 py-2 font-medium sr-only">فتح</th>
                </tr>
              </thead>
              <tbody>
                {query.data.rows.map((a) => (
                  <tr key={a.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link
                        to="/admin/articles/$id"
                        params={{ id: a.id }}
                        className="font-medium hover:text-primary"
                      >
                        {a.title_ar}
                      </Link>
                      <div className="text-xs text-muted-foreground font-mono">{a.slug}</div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{a.category_name_ar ?? "—"}</td>
                    <td className="px-3 py-2">
                      {a.is_published ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" /> منشور
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          مسودّة
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{a.reading_minutes}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                      {new Date(a.updated_at).toLocaleString("ar-SA")}
                    </td>
                    <td className="px-3 py-2 text-left">
                      <Link
                        to="/admin/articles/$id"
                        params={{ id: a.id }}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        تفاصيل <ChevronLeft className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  loading,
  error,
  tone,
}: {
  label: string;
  value: number | undefined;
  icon: React.ElementType;
  loading: boolean;
  error: boolean;
  tone?: "success" | "muted";
}) {
  const toneCls =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-primary";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${toneCls}`} aria-hidden="true" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums min-h-[2rem]">
        {loading ? (
          <span className="inline-block h-6 w-12 rounded bg-muted animate-pulse" />
        ) : error ? (
          <span className="text-xs text-destructive">تعذّر</span>
        ) : value == null ? (
          "—"
        ) : (
          value.toLocaleString("ar-SA")
        )}
      </div>
    </div>
  );
}
