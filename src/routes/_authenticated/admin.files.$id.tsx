import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  FileText,
  Trash2,
  Copy,
  Download,
  ExternalLink,
  User,
  Calendar,
  HardDrive,
  Ruler,
  FileType2,
} from "lucide-react";
import { getAdminFile, deleteAdminFile } from "@/lib/admin/files.functions";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/admin/files/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل الملف | لوحة الإدارة" },
      { name: "description", content: "عرض تفاصيل ملف الوسائط." },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل الملف</h2>
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
      الملف غير موجود.
    </div>
  ),
  component: FileDetail,
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

function FileDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getAdminFile);
  const deleteFn = useServerFn(deleteAdminFile);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const query = useQuery({
    queryKey: ["admin-file", id],
    queryFn: () => fn({ data: { id } }),
  });

  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-files"] });
      navigate({ to: "/admin/files" });
    },
  });

  if (query.isLoading) {
    return (
      <div className="container-app py-6 space-y-4" aria-busy="true">
        <div className="h-6 w-64 rounded bg-muted animate-pulse" />
        <div className="grid md:grid-cols-2 gap-4">
          <div className="aspect-video rounded-lg bg-muted/60 animate-pulse" />
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 rounded bg-muted/60 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="container-app py-16 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
        <p className="mt-3 text-sm text-destructive">
          {(query.error as Error)?.message ?? "تعذّر التحميل"}
        </p>
        <button
          type="button"
          onClick={() => query.refetch()}
          className="mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
        >
          <RefreshCw className="h-4 w-4" /> إعادة المحاولة
        </button>
      </div>
    );
  }

  const { file, uploader } = query.data;
  const fullUrl =
    typeof window !== "undefined" ? `${window.location.origin}${file.url}` : file.url;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="container-app py-6 space-y-4">
      <nav aria-label="breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/admin/files" className="hover:text-primary">الملفات</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="truncate max-w-[240px]">{file.file_name}</span>
      </nav>

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold break-all">{file.file_name}</h1>
          <p className="text-xs text-muted-foreground font-mono mt-1 break-all">
            {file.storage_path}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <ExternalLink className="h-4 w-4" /> فتح
          </a>
          <a
            href={file.url}
            download={file.file_name}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Download className="h-4 w-4" /> تنزيل
          </a>
          <button
            type="button"
            onClick={() => {
              if (confirm(`حذف الملف "${file.file_name}"؟ لا يمكن التراجع.`)) remove.mutate();
            }}
            disabled={remove.isPending}
            className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" /> {remove.isPending ? "جارٍ الحذف…" : "حذف"}
          </button>
        </div>
      </header>

      {remove.isError && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {(remove.error as Error).message}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-3">
          <div className="rounded-md bg-muted/40 flex items-center justify-center min-h-[280px] overflow-hidden">
            {file.is_image ? (
              <img
                src={file.url}
                alt={file.alt_text || file.file_name}
                className="max-w-full max-h-[480px] object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                <FileText className="h-16 w-16" />
                <span className="text-xs">{file.mime_type}</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <InfoRow icon={FileType2} label="النوع" value={file.mime_type} />
          <InfoRow icon={HardDrive} label="الحجم" value={formatBytes(Number(file.size_bytes ?? 0))} />
          {file.is_image && (file.width || file.height) && (
            <InfoRow
              icon={Ruler}
              label="الأبعاد"
              value={`${file.width ?? "—"} × ${file.height ?? "—"} px`}
            />
          )}
          <InfoRow
            icon={Calendar}
            label="تاريخ الرفع"
            value={new Date(file.created_at).toLocaleString("ar-SA")}
          />
          <InfoRow
            icon={User}
            label="بواسطة"
            value={uploader?.name ?? (uploader?.id ? uploader.id.slice(0, 8) : "—")}
          />
          {file.alt_text && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="text-xs text-muted-foreground mb-1">النص البديل</div>
              <div>{file.alt_text}</div>
            </div>
          )}

          <div className="rounded-md border bg-card p-3">
            <div className="text-xs text-muted-foreground mb-2">رابط الملف</div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={fullUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 rounded-md border bg-background px-2 py-1.5 text-xs font-mono"
              />
              <button
                type="button"
                onClick={copyUrl}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs hover:bg-muted"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? "نُسخ!" : "نسخ"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border bg-card p-3">
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <div className="flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}
