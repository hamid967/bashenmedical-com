import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Newspaper,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Save,
  X,
  Pencil,
} from "lucide-react";
import { getAdminArticle, updateAdminArticle, listAdminArticles } from "@/lib/admin/articles.functions";

export const Route = createFileRoute("/_authenticated/admin/articles/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل المقال | لوحة الإدارة" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل المقال</h2>
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
    <div className="container-app py-16 text-center text-sm text-muted-foreground">
      المقال غير موجود.
    </div>
  ),
  component: ArticleDetail,
});

type FormState = {
  title_ar: string;
  title_en: string;
  excerpt_ar: string;
  excerpt_en: string;
  content_ar: string;
  content_en: string;
  cover_image_url: string;
  author_name: string;
  category_id: string;
  reading_minutes: number;
  is_published: boolean;
};

function ArticleDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getAdminArticle);
  const listFn = useServerFn(listAdminArticles);
  const updateFn = useServerFn(updateAdminArticle);
  const router = useRouter();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["admin-article", id],
    queryFn: () => fn({ data: { id } }),
  });

  const catsQuery = useQuery({
    queryKey: ["admin-articles-cats"],
    queryFn: () => listFn({ data: {} }),
    select: (d) => d.categories,
    staleTime: 60_000,
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (query.data?.article && !form) {
      const a: any = query.data.article;
      setForm({
        title_ar: a.title_ar ?? "",
        title_en: a.title_en ?? "",
        excerpt_ar: a.excerpt_ar ?? "",
        excerpt_en: a.excerpt_en ?? "",
        content_ar: a.content_ar ?? "",
        content_en: a.content_en ?? "",
        cover_image_url: a.cover_image_url ?? "",
        author_name: a.author_name ?? "",
        category_id: a.category_id ?? "",
        reading_minutes: a.reading_minutes ?? 1,
        is_published: !!a.is_published,
      });
    }
  }, [query.data, form]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error("لا توجد بيانات");
      return updateFn({
        data: {
          id,
          title_ar: form.title_ar,
          title_en: form.title_en.trim() || null,
          excerpt_ar: form.excerpt_ar,
          excerpt_en: form.excerpt_en.trim() || null,
          content_ar: form.content_ar,
          content_en: form.content_en.trim() || null,
          cover_image_url: form.cover_image_url.trim() || null,
          author_name: form.author_name.trim() || null,
          category_id: form.category_id || null,
          reading_minutes: Number(form.reading_minutes) || 1,
          is_published: form.is_published,
        },
      });
    },
    onSuccess: () => {
      setSaved(true);
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["admin-article", id] });
      qc.invalidateQueries({ queryKey: ["admin-articles"] });
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (query.isLoading) {
    return (
      <div className="container-app py-6 space-y-3" aria-busy="true">
        <div className="h-8 w-1/3 rounded bg-muted animate-pulse" />
        <div className="h-64 rounded-lg bg-muted/60 animate-pulse" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="container-app py-10">
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive"
        >
          <AlertTriangle className="inline h-4 w-4 me-1" />
          {(query.error as Error)?.message ?? "تعذّر التحميل"}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => router.invalidate()}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs hover:bg-background"
            >
              <RefreshCw className="h-3 w-3" /> إعادة المحاولة
            </button>
          </div>
        </div>
      </div>
    );
  }

  const article: any = query.data!.article;
  const cats = catsQuery.data ?? [];

  return (
    <div className="container-app py-6 space-y-6 max-w-4xl">
      <nav className="text-xs text-muted-foreground">
        <Link to="/admin/articles" className="hover:text-foreground inline-flex items-center gap-1">
          <ArrowRight className="h-3 w-3" /> المقالات
        </Link>
      </nav>

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Newspaper className="h-7 w-7 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold">{article.title_ar}</h1>
            <p className="text-xs font-mono text-muted-foreground mt-1">{article.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> تم الحفظ
            </span>
          )}
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Pencil className="h-4 w-4" /> تعديل
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setForm(null);
                }}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
              >
                <X className="h-4 w-4" /> إلغاء
              </button>
              <button
                type="button"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90 disabled:opacity-60"
              >
                {mutation.isPending ? (
                  <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-r-transparent animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                حفظ
              </button>
            </>
          )}
        </div>
      </header>

      {mutation.isError && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="inline h-4 w-4 me-1" />
          {(mutation.error as Error)?.message ?? "تعذّر الحفظ"}
        </div>
      )}

      {!editing ? (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Info label="الحالة" value={article.is_published ? "منشور" : "مسودّة"} tone={article.is_published ? "success" : undefined} />
            <Info label="دقائق القراءة" value={String(article.reading_minutes)} />
            <Info label="التصنيف" value={article.health_categories?.name_ar ?? "—"} />
            <Info label="الكاتب" value={article.author_name ?? "—"} />
          </section>

          {article.cover_image_url && (
            <img
              src={article.cover_image_url}
              alt=""
              className="w-full max-h-80 object-cover rounded-lg border"
              loading="lazy"
            />
          )}

          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-medium mb-2 text-muted-foreground">الملخص</h2>
            <p className="text-sm">{article.excerpt_ar}</p>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-medium mb-2 text-muted-foreground">المحتوى</h2>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{article.content_ar}</div>
          </section>
        </>
      ) : form ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <Field label="العنوان (عربي) *">
            <input
              type="text"
              required
              minLength={3}
              maxLength={300}
              value={form.title_ar}
              onChange={(e) => setForm({ ...form, title_ar: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="العنوان (إنجليزي)">
            <input
              type="text"
              maxLength={300}
              dir="ltr"
              value={form.title_en}
              onChange={(e) => setForm({ ...form, title_en: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="التصنيف">
              <select
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">بدون تصنيف</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name_ar}</option>
                ))}
              </select>
            </Field>
            <Field label="دقائق القراءة *">
              <input
                type="number"
                required
                min={1}
                max={240}
                value={form.reading_minutes}
                onChange={(e) => setForm({ ...form, reading_minutes: Number(e.target.value) })}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="الكاتب">
              <input
                type="text"
                maxLength={200}
                value={form.author_name}
                onChange={(e) => setForm({ ...form, author_name: e.target.value })}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <Field label="رابط الغلاف">
            <input
              type="url"
              dir="ltr"
              maxLength={1024}
              value={form.cover_image_url}
              onChange={(e) => setForm({ ...form, cover_image_url: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
              placeholder="https://…"
            />
          </Field>

          <Field label="الملخص (عربي) *">
            <textarea
              required
              minLength={3}
              maxLength={1000}
              rows={3}
              value={form.excerpt_ar}
              onChange={(e) => setForm({ ...form, excerpt_ar: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="الملخص (إنجليزي)">
            <textarea
              maxLength={1000}
              rows={3}
              dir="ltr"
              value={form.excerpt_en}
              onChange={(e) => setForm({ ...form, excerpt_en: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>

          <Field label="المحتوى (عربي) *">
            <textarea
              required
              minLength={3}
              maxLength={50000}
              rows={14}
              value={form.content_ar}
              onChange={(e) => setForm({ ...form, content_ar: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
            />
          </Field>
          <Field label="المحتوى (إنجليزي)">
            <textarea
              maxLength={50000}
              rows={10}
              dir="ltr"
              value={form.content_en}
              onChange={(e) => setForm({ ...form, content_en: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
            />
          </Field>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
              className="h-4 w-4 rounded border"
            />
            نشر المقال
          </label>
        </form>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}

function Info({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-sm font-medium ${
          tone === "success" ? "text-emerald-700 dark:text-emerald-300" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
