import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  FolderOpen,
  RefreshCw,
  AlertTriangle,
  Search,
  ChevronLeft,
  Upload,
  Image as ImageIcon,
  FileText,
  HardDrive,
  CalendarDays,
  X,
  Trash2,
} from "lucide-react";
import { listAdminFiles, uploadAdminFile, deleteAdminFile } from "@/lib/admin/files.functions";

export const Route = createFileRoute("/_authenticated/admin/files")({
  head: () => ({
    meta: [
      { title: "الملفات | لوحة الإدارة" },
      { name: "description", content: "مكتبة الوسائط: رفع، عرض، وإدارة الملفات." },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل مكتبة الملفات</h2>
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
  component: FilesList,
});

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function FilesList() {
  const fn = useServerFn(listAdminFiles);
  const uploadFn = useServerFn(uploadAdminFile);
  const deleteFn = useServerFn(deleteAdminFile);
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "image" | "other">("all");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: ["admin-files", q, kind],
    queryFn: () => fn({ data: { q: q.trim() || undefined, kind } }),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const b64 = btoa(binary);
      return uploadFn({
        data: {
          file_name: file.name,
          mime_type: file.type || "application/octet-stream",
          data_base64: b64,
        },
      });
    },
    onSuccess: () => {
      setUploadError(null);
      qc.invalidateQueries({ queryKey: ["admin-files"] });
    },
    onError: (e: Error) => setUploadError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-files"] }),
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload.mutate(file);
    e.target.value = "";
  };

  return (
    <div className="container-app py-6 space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <FolderOpen className="h-6 w-6 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold">الملفات</h1>
            <p className="text-sm text-muted-foreground">
              مكتبة الوسائط: صور، مستندات، ومرفقات الموقع
            </p>
          </div>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf"
            onChange={onPick}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {upload.isPending ? "جاري الرفع…" : "رفع ملف"}
          </button>
        </div>
      </header>

      {uploadError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center justify-between"
        >
          <span>{uploadError}</span>
          <button onClick={() => setUploadError(null)} aria-label="إغلاق">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <section aria-label="مؤشرات الملفات" className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          label="إجمالي الملفات"
          value={query.data?.kpis.total}
          icon={FolderOpen}
          loading={query.isLoading}
          error={query.isError}
        />
        <KpiCard
          label="الصور"
          value={query.data?.kpis.images}
          icon={ImageIcon}
          loading={query.isLoading}
          error={query.isError}
          tone="success"
        />
        <KpiCard
          label="ملفات أخرى"
          value={query.data?.kpis.other}
          icon={FileText}
          loading={query.isLoading}
          error={query.isError}
          tone="muted"
        />
        <KpiCard
          label="الحجم الكلي"
          value={query.data?.kpis.total_bytes}
          icon={HardDrive}
          loading={query.isLoading}
          error={query.isError}
          format="bytes"
        />
        <KpiCard
          label="رُفعت اليوم"
          value={query.data?.kpis.uploaded_today}
          icon={CalendarDays}
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
            placeholder="ابحث بالاسم أو النص البديل"
            className="w-full rounded-md border bg-background pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="بحث"
          />
        </div>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as any)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
          aria-label="النوع"
        >
          <option value="all">كل الأنواع</option>
          <option value="image">صور فقط</option>
          <option value="other">مستندات وأخرى</option>
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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3" aria-busy="true">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="aspect-square rounded-lg bg-muted/60 animate-pulse" />
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
          <FolderOpen className="mx-auto h-10 w-10 opacity-40 mb-2" />
          لا توجد ملفات. ابدأ برفع أول ملف.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {query.data.rows.map((f) => (
            <div
              key={f.id}
              className="group relative rounded-lg border bg-card overflow-hidden hover:shadow-md transition"
            >
              <Link to="/admin/files/$id" params={{ id: f.id }} className="block">
                <div className="aspect-square bg-muted/40 flex items-center justify-center overflow-hidden">
                  {f.is_image ? (
                    <img
                      src={f.url}
                      alt={f.alt_text || f.file_name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FileText className="h-10 w-10 text-muted-foreground" />
                  )}
                </div>
                <div className="p-2">
                  <div className="text-xs font-medium truncate" title={f.file_name}>
                    {f.file_name}
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                    {formatBytes(Number(f.size_bytes ?? 0))}
                  </div>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`حذف الملف "${f.file_name}"؟`)) remove.mutate(f.id);
                }}
                disabled={remove.isPending}
                className="absolute top-1 left-1 inline-flex items-center justify-center rounded-md bg-background/90 p-1 text-destructive opacity-0 group-hover:opacity-100 transition hover:bg-destructive hover:text-destructive-foreground"
                aria-label="حذف"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <Link
                to="/admin/files/$id"
                params={{ id: f.id }}
                className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[10px] text-primary opacity-0 group-hover:opacity-100 transition"
              >
                تفاصيل <ChevronLeft className="h-3 w-3" />
              </Link>
            </div>
          ))}
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
  format,
}: {
  label: string;
  value: number | undefined;
  icon: React.ElementType;
  loading: boolean;
  error: boolean;
  tone?: "success" | "muted";
  format?: "bytes";
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
        ) : format === "bytes" ? (
          formatBytes(Number(value))
        ) : (
          value.toLocaleString("ar-SA")
        )}
      </div>
    </div>
  );
}
