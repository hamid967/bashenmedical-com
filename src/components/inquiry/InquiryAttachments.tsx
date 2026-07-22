import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Paperclip,
  Trash2,
  Upload,
  FileText,
  ImageIcon,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
} from "lucide-react";
import {
  requestInquiryUploadUrl,
  registerInquiryAttachment,
  listInquiryAttachments,
  deleteInquiryAttachment,
  scanInquiryAttachment,
  ATTACHMENT_LIMITS,
} from "@/lib/inquiry/attachments.functions";

const HUMAN_ACCEPT = "JPG · PNG · WEBP · HEIC · PDF";

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function InquiryAttachments({
  inquiryId,
  disabled = false,
  disabledReason,
  compact = false,
}: {
  inquiryId: string;
  disabled?: boolean;
  disabledReason?: string;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listInquiryAttachments);
  const signFn = useServerFn(requestInquiryUploadUrl);
  const registerFn = useServerFn(registerInquiryAttachment);
  const deleteFn = useServerFn(deleteInquiryAttachment);
  const scanFn = useServerFn(scanInquiryAttachment);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const listKey = ["inquiry-attachments", inquiryId] as const;
  const q = useQuery({
    queryKey: listKey,
    queryFn: () => listFn({ data: { inquiry_id: inquiryId } }),
    staleTime: 60_000,
    // Poll every 3s while any attachment is still being scanned.
    refetchInterval: (query) => {
      const rows = query.state.data as Array<{ scan_status: string }> | undefined;
      const busy = rows?.some((r) => r.scan_status === "pending" || r.scan_status === "scanning");
      return busy ? 3000 : false;
    },
  });

  const remaining = useMemo(
    () => Math.max(0, ATTACHMENT_LIMITS.maxPerInquiry - (q.data?.length ?? 0)),
    [q.data],
  );

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف المرفق");
      qc.invalidateQueries({ queryKey: listKey });
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر حذف المرفق"),
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (disabled) return;

    for (const file of Array.from(files)) {
      if (!ATTACHMENT_LIMITS.allowedContentTypes.includes(file.type)) {
        toast.error(`نوع الملف غير مسموح: ${file.name}. الأنواع المسموح بها: ${HUMAN_ACCEPT}.`);
        continue;
      }
      if (file.size > ATTACHMENT_LIMITS.maxBytes) {
        toast.error(
          `الملف ${file.name} أكبر من الحدّ المسموح (${humanBytes(ATTACHMENT_LIMITS.maxBytes)}).`,
        );
        continue;
      }
      try {
        setUploading(true);
        const signed = await signFn({
          data: {
            inquiry_id: inquiryId,
            file_name: file.name,
            content_type: file.type,
            size_bytes: file.size,
          },
        });
        const put = await fetch(signed.upload_url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) {
          throw new Error(`تعذّر رفع الملف (${put.status}).`);
        }
        const reg = await registerFn({
          data: {
            inquiry_id: inquiryId,
            storage_path: signed.storage_path,
            file_name: file.name,
            content_type: file.type,
            size_bytes: file.size,
          },
        });
        toast.success(`تم رفع: ${file.name} — جارٍ فحص الفيروسات…`);
        // Kick off the scan asynchronously; polling will surface the result.
        scanFn({ data: { id: reg.id } })
          .then((res) => {
            if (res.scan_status === "infected") {
              toast.error(`تم حجب ${file.name} بعد اكتشاف محتوى مشبوه.`);
            } else if (res.scan_status === "clean") {
              toast.success(`اجتاز ${file.name} فحص الفيروسات.`);
            }
            qc.invalidateQueries({ queryKey: listKey });
          })
          .catch((e: any) => {
            toast.error(`تعذّر إتمام فحص ${file.name}: ${e?.message ?? ""}`);
            qc.invalidateQueries({ queryKey: listKey });
          });
      } catch (e: any) {
        toast.error(e?.message ?? `تعذّر رفع ${file.name}`);
      } finally {
        setUploading(false);
      }
    }
    qc.invalidateQueries({ queryKey: listKey });
    if (inputRef.current) inputRef.current.value = "";
  }

  function ScanBadge({
    status,
    reason,
  }: {
    status: "pending" | "scanning" | "clean" | "infected" | "error";
    reason?: string | null;
  }) {
    if (status === "clean") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
          <ShieldCheck className="h-3 w-3" /> سليم
        </span>
      );
    }
    if (status === "infected") {
      return (
        <span
          title={reason ?? undefined}
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200"
        >
          <ShieldAlert className="h-3 w-3" /> محجوب — {reason ?? "محتوى مشبوه"}
        </span>
      );
    }
    if (status === "error") {
      return (
        <span
          title={reason ?? undefined}
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"
        >
          <ShieldQuestion className="h-3 w-3" /> تعذّر الفحص
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
        <Loader2 className="h-3 w-3 animate-spin" /> قيد الفحص
      </span>
    );
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-semibold inline-flex items-center gap-2">
          <Paperclip className="h-4 w-4" /> المرفقات
        </div>
        <div className="text-[11px] text-muted-foreground">
          {HUMAN_ACCEPT} · حتى {humanBytes(ATTACHMENT_LIMITS.maxBytes)} · متبقّي {remaining}/
          {ATTACHMENT_LIMITS.maxPerInquiry}
        </div>
      </div>

      <div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={ATTACHMENT_LIMITS.allowedAcceptAttr}
          onChange={(e) => handleFiles(e.target.files)}
          disabled={disabled || uploading || remaining === 0}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading || remaining === 0}
          className="inline-flex items-center gap-2 px-3 h-9 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          رفع ملف
        </button>
        {disabled && disabledReason && (
          <div className="mt-1 text-[11px] text-muted-foreground">{disabledReason}</div>
        )}
        {!disabled && remaining === 0 && (
          <div className="mt-1 text-[11px] text-amber-600">
            تم الوصول إلى الحدّ الأقصى للمرفقات لهذا الطلب.
          </div>
        )}
      </div>

      {q.isLoading ? (
        <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ التحميل…
        </div>
      ) : (q.data?.length ?? 0) === 0 ? (
        <div className="text-xs text-muted-foreground">لا توجد مرفقات بعد.</div>
      ) : (
        <ul className="space-y-1.5">
          {q.data!.map((a) => {
            const isImage = a.content_type.startsWith("image/");
            return (
              <li
                key={a.id}
                className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/30 text-sm"
              >
                {isImage ? (
                  <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate flex items-center gap-2">
                    <span className="truncate">{a.file_name}</span>
                    <ScanBadge status={a.scan_status} reason={a.scan_result?.reason} />
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {humanBytes(a.size_bytes)} · {new Date(a.created_at).toLocaleString("ar-SA")}
                  </div>
                </div>
                {a.scan_status === "clean" && a.download_url ? (
                  <a
                    href={a.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    عرض
                  </a>
                ) : a.scan_status === "infected" ? (
                  <span className="text-[11px] text-red-600">غير متاح</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`حذف المرفق "${a.file_name}"؟`)) deleteMut.mutate(a.id);
                  }}
                  disabled={disabled || deleteMut.isPending}
                  className="p-1 rounded hover:bg-destructive/10 text-destructive disabled:opacity-40"
                  aria-label="حذف"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
