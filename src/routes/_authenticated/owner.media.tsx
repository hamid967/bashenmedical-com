import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listOwnerMedia, uploadOwnerMedia, deleteOwnerMedia } from "@/lib/owner/media.functions";
import { Button } from "@/components/ui-v3";
import { Input } from "@/components/ui-v3";
import { Label } from "@/components/ui-v3";
import { Image as ImageIcon, Upload, Trash2, Loader2, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/owner/media")({
  head: () => ({
    meta: [
      { title: "مكتبة الوسائط · Site Builder" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: OwnerMediaLibrary,
});

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function OwnerMediaLibrary() {
  const listFn = useServerFn(listOwnerMedia);
  const uploadFn = useServerFn(uploadOwnerMedia);
  const deleteFn = useServerFn(deleteOwnerMedia);
  const inputRef = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["owner", "media"], queryFn: () => listFn() });

  useEffect(() => {
    // keep query fresh when returning to page
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const data_base64 = await fileToBase64(file);
      await uploadFn({
        data: {
          file_name: file.name,
          mime_type: file.type,
          data_base64,
          alt_text: alt,
        },
      });
      toast.success("تم الرفع");
      setAlt("");
      q.refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "تعذّر الرفع");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`حذف الملف "${name}"؟`)) return;
    setBusy(id);
    try {
      await deleteFn({ data: { id } });
      toast.success("تم الحذف");
      q.refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الحذف");
    } finally {
      setBusy(null);
    }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).then(
      () => toast.success("تم نسخ الرابط"),
      () => toast.error("تعذّر النسخ"),
    );
  }

  return (
    <div className="p-6 md:p-8" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ImageIcon className="h-6 w-6" /> مكتبة الوسائط
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            ارفع صوراً واستخدم روابطها في الصفحات والخدمات ومراكز التميز.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">نص بديل (اختياري)</Label>
            <Input
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="وصف الصورة"
              className="w-48"
            />
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="hidden"
            onChange={onFile}
          />
          <Button disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? (
              <Loader2 className="h-4 w-4 ml-1 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 ml-1" />
            )}
            رفع صورة
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="p-8 text-center text-slate-500">جاري التحميل…</div>
      ) : q.error ? (
        <div className="p-8 text-center text-red-600">{(q.error as Error).message}</div>
      ) : !q.data?.length ? (
        <div className="p-12 text-center bg-white rounded-xl border">
          <ImageIcon className="h-10 w-10 mx-auto text-slate-300 mb-3" />
          <div className="text-slate-700 font-medium">لا توجد ملفات بعد</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {q.data.map((m: any) => (
            <div
              key={m.id}
              className="bg-white rounded-xl border overflow-hidden group flex flex-col"
            >
              <div className="aspect-square bg-slate-50 relative">
                <img
                  src={m.url}
                  alt={m.alt_text || m.file_name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="p-3 flex-1 flex flex-col">
                <div className="text-xs font-medium text-slate-800 truncate" title={m.file_name}>
                  {m.file_name}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {Math.round((m.size_bytes ?? 0) / 1024)} KB
                </div>
                <div className="mt-auto pt-2 flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => copyUrl(m.url)}
                  >
                    <Copy className="h-3.5 w-3.5 ml-1" /> نسخ
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={busy === m.id}
                    onClick={() => handleDelete(m.id, m.file_name)}
                    aria-label="حذف"
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
